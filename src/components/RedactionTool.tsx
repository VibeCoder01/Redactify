"use client";

import React, { useState, useTransition, useMemo, useRef } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { jsPDF } from "jspdf";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FileUp, Sparkles, Download, Loader2, X, Check, Trash2 } from "lucide-react";
import { suggestRedactionTerms } from "@/ai/flows/suggest-redaction-terms";
import { useToast } from "@/hooks/use-toast";

if (typeof window !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

export function RedactionTool() {
    const [documentText, setDocumentText] = useState("");
    const [selectedText, setSelectedText] = useState("");
    const [redactionTerms, setRedactionTerms] = useState<string[]>([]);
    const [suggestedTerms, setSuggestedTerms] = useState<string[]>([]);
    const [isRedacted, setIsRedacted] = useState(false);
    const [redactedText, setRedactedText] = useState("");
    const [isPending, startTransition] = useTransition();
    const [isParsing, setIsParsing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }

        if (file.type !== 'application/pdf') {
            toast({
                variant: 'destructive',
                title: 'Invalid File Type',
                description: 'Please upload a PDF file.',
            });
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
            return;
        }

        setIsParsing(true);
        handleReset();

        const reader = new FileReader();
        reader.onload = async (e) => {
            const buffer = e.target?.result;
            if (buffer) {
                try {
                    const pdf = await pdfjsLib.getDocument({ data: buffer as ArrayBuffer }).promise;
                    let fullText = "";
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const textContent = await page.getTextContent();
                        const pageText = textContent.items.map(item => 'str' in item ? item.str : '').join(" ");
                        fullText += pageText + "\n\n";
                    }
                    setDocumentText(fullText);
                    toast({
                        title: 'PDF Loaded',
                        description: `"${file.name}" has been loaded successfully.`,
                    });
                } catch (error) {
                    console.error("Failed to parse PDF:", error);
                    toast({
                        variant: 'destructive',
                        title: 'PDF Parsing Error',
                        description: 'Could not read the content of the PDF file.',
                    });
                } finally {
                    setIsParsing(false);
                }
            }
        };
        reader.onerror = () => {
            console.error('FileReader error');
            toast({
                variant: 'destructive',
                title: 'File Read Error',
                description: 'There was an error reading the file.',
            });
            setIsParsing(false);
        };
        reader.readAsArrayBuffer(file);
    };

    const handleSelection = () => {
        if (isRedacted) return;
        const text = window.getSelection()?.toString().trim();
        if (text && !redactionTerms.includes(text) && !suggestedTerms.includes(text)) {
            setSelectedText(text);
        }
    };
    
    const handleSuggest = () => {
        startTransition(async () => {
            try {
                const result = await suggestRedactionTerms({ text: documentText });
                if (result && result.terms) {
                    const newSuggestions = result.terms.filter(
                        term => !redactionTerms.find(rt => rt.toLowerCase() === term.toLowerCase())
                    );
                    setSuggestedTerms(prev => [...new Set([...prev, ...newSuggestions])]);
                    toast({
                        title: "Suggestions Ready",
                        description: `We've found ${newSuggestions.length} new terms you might want to redact.`,
                    });
                }
            } catch (error) {
                console.error("AI suggestion failed:", error);
                toast({
                    variant: "destructive",
                    title: "Error",
                    description: "Could not get suggestions from AI.",
                });
            }
        });
    };
    
    const acceptSuggestion = (term: string) => {
        setRedactionTerms(prev => [...new Set([...prev, term])]);
        setSuggestedTerms(prev => prev.filter(t => t !== term));
    }

    const rejectSuggestion = (term: string) => {
        setSuggestedTerms(prev => prev.filter(t => t !== term));
    }

    const removeRedactionTerm = (term: string) => {
        setRedactionTerms(prev => prev.filter(t => t !== term));
    }

    const handleApplyRedaction = () => {
        const uniqueTerms = [...new Set(redactionTerms)];
        let finalRedactedText = documentText;
        if (uniqueTerms.length > 0) {
            const regex = new RegExp(uniqueTerms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');
            finalRedactedText = documentText.replace(regex, match => '█'.repeat(match.length));
        }
        setRedactedText(finalRedactedText);
        
        setIsRedacted(true);
        setSuggestedTerms([]);
        setSelectedText('');
        toast({
            title: "Redactions Applied",
            description: "The document has been redacted.",
            variant: 'default'
        });
    };

    const handleReset = () => {
        setDocumentText("");
        setSelectedText("");
        setRedactionTerms([]);
        setSuggestedTerms([]);
        setIsRedacted(false);
        setRedactedText("");
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleDownload = () => {
        if (!isRedacted || !redactedText) return;

        const pdf = new jsPDF({
            orientation: 'p',
            unit: 'mm',
            format: 'a4'
        });

        const margin = 15;
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const textWidth = pageWidth - margin * 2;
        const lineHeight = 7;
        
        pdf.setFont("courier", "normal");
        pdf.setFontSize(12);

        const lines = pdf.splitTextToSize(redactedText, textWidth);

        let cursorY = margin;

        lines.forEach((line: string) => {
            if (cursorY + lineHeight > pageHeight - margin) {
                pdf.addPage();
                cursorY = margin;
            }
            pdf.text(line, margin, cursorY);
            cursorY += lineHeight;
        });

        pdf.save("redacted-document.pdf");
    };

    const highlightedDocument = useMemo(() => {
        if (!documentText && !isParsing) {
            return (
                <div className="flex items-center justify-center h-full text-center">
                    <div>
                        <FileUp className="mx-auto h-12 w-12 text-muted-foreground" />
                        <h3 className="mt-2 text-sm font-semibold text-foreground">No Document</h3>
                        <p className="mt-1 text-sm text-muted-foreground">Upload a PDF to get started.</p>
                    </div>
                </div>
            );
        }

        if (isParsing) {
             return (
                <div className="flex items-center justify-center h-full text-center">
                    <div>
                        <Loader2 className="mx-auto h-12 w-12 text-muted-foreground animate-spin" />
                        <h3 className="mt-2 text-sm font-semibold text-foreground">Parsing PDF...</h3>
                        <p className="mt-1 text-sm text-muted-foreground">Please wait while we process your document.</p>
                    </div>
                </div>
            );
        }

        if (isRedacted) {
            return <pre className="whitespace-pre-wrap font-sans text-sm">{redactedText}</pre>;
        }

        const allTerms = [
            ...redactionTerms.map(term => ({ term, type: 'redaction' })),
            ...suggestedTerms.map(term => ({ term, type: 'suggestion' }))
        ].filter(item => item.term.trim() !== '');

        const uniqueAllTerms = [...new Map(allTerms.map(item => [item.term.toLowerCase(), item])).values()];

        if (uniqueAllTerms.length === 0) {
            return <pre className="whitespace-pre-wrap font-sans text-sm">{documentText}</pre>;
        }

        const regex = new RegExp(`(${uniqueAllTerms.map(item => item.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
        const parts = documentText.split(regex);

        return (
            <pre className="whitespace-pre-wrap font-sans text-sm">
                {parts.map((part, index) => {
                    const matchedTerm = uniqueAllTerms.find(t => t.term.toLowerCase() === part.toLowerCase());
                    if (matchedTerm) {
                        const isRedaction = redactionTerms.some(rt => rt.toLowerCase() === part.toLowerCase());
                        let className = 'rounded px-0.5 py-0.5';
                        if (isRedaction) {
                            className += ' bg-primary/30';
                        } else {
                            className += ' bg-accent/30 cursor-pointer hover:bg-accent/50';
                        }
                        return <mark key={index} className={className} onClick={() => !isRedaction && acceptSuggestion(part)}>{part}</mark>;
                    }
                    return <span key={index}>{part}</span>;
                })}
            </pre>
        );
    }, [documentText, redactionTerms, suggestedTerms, isRedacted, isParsing, redactedText]);


    return (
        <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
                <CardHeader>
                    <CardTitle>Document Viewer</CardTitle>
                    <CardDescription>{isRedacted ? "Redactions have been applied." : "Select text to redact or use Smart Suggestions."}</CardDescription>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-[60vh] w-full rounded-md border bg-muted/20 p-4" onMouseUp={handleSelection}>
                        {highlightedDocument}
                    </ScrollArea>
                </CardContent>
            </Card>

            <div className="lg:col-span-1 flex flex-col gap-6">
                <Card>
                    <CardHeader><CardTitle>Controls</CardTitle></CardHeader>
                    <CardContent className="grid gap-4">
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            style={{ display: 'none' }}
                            accept="application/pdf"
                        />
                        <Button onClick={() => fileInputRef.current?.click()} disabled={isParsing || !!documentText}>
                            {isParsing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
                            {isParsing ? "Parsing PDF..." : "Upload PDF"}
                        </Button>
                        <Button onClick={handleSuggest} disabled={!documentText || isPending || isRedacted}>
                            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                            Smart Suggestion
                        </Button>
                    </CardContent>
                    <CardFooter className="grid grid-cols-2 gap-2">
                        <Button onClick={handleApplyRedaction} disabled={redactionTerms.length === 0 || isRedacted} className="bg-accent hover:bg-accent/90">Apply Redaction</Button>
                        <Button variant="destructive" onClick={handleReset}><Trash2 className="mr-2 h-4 w-4" /> Reset</Button>
                    </CardFooter>
                     <CardFooter>
                        <Button onClick={handleDownload} className="w-full" disabled={!isRedacted}>
                            <Download className="mr-2 h-4 w-4" /> Download PDF
                        </Button>
                    </CardFooter>
                </Card>

                {selectedText && !isRedacted && (
                    <Card className="animate-in fade-in"><CardHeader><CardTitle>Manual Selection</CardTitle></CardHeader>
                        <CardContent><p className="text-sm font-mono p-2 bg-muted rounded">"{selectedText}"</p></CardContent>
                        <CardFooter className="gap-2"><Button className="w-full" onClick={() => { setRedactionTerms(prev => [...prev, selectedText]); setSelectedText(''); }}>Add to List</Button><Button variant="ghost" size="icon" onClick={() => setSelectedText('')}><X className="h-4 w-4"/></Button></CardFooter>
                    </Card>
                )}
                
                {(suggestedTerms.length > 0 && !isRedacted) && (
                    <Card><CardHeader><CardTitle>Suggested Terms</CardTitle></CardHeader>
                        <CardContent>
                            <ScrollArea className="h-32"><div className="space-y-2">
                                {suggestedTerms.map((term, i) => (
                                    <div key={i} className="flex items-center justify-between text-sm p-2 rounded-md hover:bg-muted">
                                        <span className="font-mono">{term}</span>
                                        <div className="flex items-center gap-1">
                                            <TooltipProvider><Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7 text-green-500 hover:text-green-500" onClick={() => acceptSuggestion(term)}><Check className="h-4 w-4"/></Button></TooltipTrigger><TooltipContent><p>Accept</p></TooltipContent></Tooltip></TooltipProvider>
                                            <TooltipProvider><Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-500" onClick={() => rejectSuggestion(term)}><X className="h-4 w-4"/></Button></TooltipTrigger><TooltipContent><p>Reject</p></TooltipContent></Tooltip></TooltipProvider>
                                        </div>
                                    </div>
                                ))}
                            </div></ScrollArea>
                        </CardContent>
                    </Card>
                )}

                {(redactionTerms.length > 0 && !isRedacted) && (
                    <Card><CardHeader><CardTitle>Redaction List</CardTitle><CardDescription>{redactionTerms.length} term(s) will be redacted.</CardDescription></CardHeader>
                        <CardContent>
                            <ScrollArea className="h-32"><div className="flex flex-wrap gap-2">
                                {redactionTerms.map((term, i) => (
                                    <Badge key={i} variant="secondary" className="text-base font-normal">
                                        {term}
                                        <button onClick={() => removeRedactionTerm(term)} className="ml-2 rounded-full hover:bg-destructive/20 p-0.5"><X className="h-3 w-3 text-destructive"/></button>
                                    </Badge>
                                ))}
                            </div></ScrollArea>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
