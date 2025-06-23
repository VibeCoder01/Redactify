
"use client";

import React, { useState, useTransition, useMemo, useRef } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { PDFDocument, rgb } from 'pdf-lib';
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

interface PdfTextItem {
    str: string;
    dir: string;
    transform: number[];
    width: number;
    height: number;
    pageIndex: number;
}

export function RedactionTool() {
    const [documentText, setDocumentText] = useState("");
    const [selectedText, setSelectedText] = useState("");
    const [redactionTerms, setRedactionTerms] = useState<string[]>([]);
    const [suggestedTerms, setSuggestedTerms] = useState<string[]>([]);
    const [isSuggesting, startSuggestionTransition] = useTransition();
    const [isDownloading, setIsDownloading] = useState(false);
    const [isParsing, setIsParsing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();

    const [originalPdf, setOriginalPdf] = useState<ArrayBuffer | null>(null);
    const [pdfTextItems, setPdfTextItems] = useState<PdfTextItem[]>([]);

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
            const buffer = e.target?.result as ArrayBuffer;
            if (buffer) {
                try {
                    setOriginalPdf(buffer);
                    const bufferForParsing = buffer.slice(0);
                    const pdf = await pdfjsLib.getDocument({ data: bufferForParsing }).promise;
                    let fullText = "";
                    const items: PdfTextItem[] = [];

                    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                        const page = await pdf.getPage(pageNum);
                        const textContent = await page.getTextContent();
                        
                        fullText += textContent.items.map(item => 'str' in item ? item.str : '').join(" ") + "\n\n";
                        
                        textContent.items.forEach(item => {
                            if ('str' in item && item.str.trim().length > 0) {
                                items.push({
                                    str: item.str,
                                    dir: item.dir,
                                    transform: item.transform,
                                    width: item.width,
                                    height: item.height,
                                    pageIndex: pageNum - 1,
                                });
                            }
                        });
                    }
                    setDocumentText(fullText);
                    setPdfTextItems(items);
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
        const text = window.getSelection()?.toString().trim();
        if (text && !redactionTerms.includes(text) && !suggestedTerms.includes(text)) {
            setSelectedText(text);
        }
    };
    
    const handleSuggest = () => {
        startSuggestionTransition(async () => {
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

    const handleReset = () => {
        setDocumentText("");
        setSelectedText("");
        setRedactionTerms([]);
        setSuggestedTerms([]);
        setOriginalPdf(null);
        setPdfTextItems([]);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleDownload = async () => {
        if (!originalPdf || redactionTerms.length === 0) return;

        setIsDownloading(true);
        try {
            const pdfDoc = await PDFDocument.load(originalPdf.slice(0));
            const pages = pdfDoc.getPages();
            const allTerms = [...new Set(redactionTerms)];

            // Create a searchable text string without spaces, and a map to get back to original items.
            // This allows for matching terms that span across multiple text chunks from the PDF.
            const searchableTextChars: string[] = [];
            const charToItemMap: number[] = [];
            pdfTextItems.forEach((item, index) => {
                const text = item.str;
                for (let i = 0; i < text.length; i++) {
                    const char = text[i];
                    // Build a string of only non-whitespace characters for searching
                    if (char.trim() !== '') {
                        searchableTextChars.push(char);
                        // Map each character in the searchable string back to its original item
                        charToItemMap.push(index);
                    }
                }
            });
            const searchableText = searchableTextChars.join('').toLowerCase();

            for (const term of allTerms) {
                const termToSearch = term.replace(/\s/g, '').toLowerCase();
                if (termToSearch.length === 0) continue;

                let startIndex = 0;
                let foundIndex;

                // Loop to find all occurrences of the term
                while ((foundIndex = searchableText.indexOf(termToSearch, startIndex)) > -1) {
                    const firstItemIdx = charToItemMap[foundIndex];
                    const lastItemIdx = charToItemMap[foundIndex + termToSearch.length - 1];
                    const matchedItems = pdfTextItems.slice(firstItemIdx, lastItemIdx + 1);

                    if (matchedItems.length > 0) {
                        const pageIndex = matchedItems[0].pageIndex;
                        // Ensure all parts of the match are on the same page before drawing
                        if (matchedItems.every(item => item.pageIndex === pageIndex)) {
                            const page = pages[pageIndex];
                            const { height: pageHeight } = page.getSize();
                            
                            let minX = Infinity, maxX = -Infinity;
                            let minY = Infinity, maxY = -Infinity;

                            // Calculate a single bounding box that encloses all the text items in the match
                            matchedItems.forEach(match => {
                                const tx = match.transform[4];
                                const ty = match.transform[5];
                                minX = Math.min(minX, tx);
                                maxX = Math.max(maxX, tx + match.width);
                                minY = Math.min(minY, ty);
                                maxY = Math.max(maxY, ty + match.height);
                            });

                            const padding = 2; // Add some padding to ensure full coverage

                            // Convert y-coordinate from pdf.js (top-left origin) to pdf-lib (bottom-left origin)
                            const boxWidth = (maxX - minX) + (padding * 2);
                            const boxHeight = (maxY - minY) + (padding * 2);
                            const boxX = minX - padding;
                            const boxY = pageHeight - maxY - padding;


                            page.drawRectangle({
                                x: boxX,
                                y: boxY,
                                width: boxWidth,
                                height: boxHeight,
                                color: rgb(0, 0, 0),
                            });
                        }
                    }
                    // Continue searching from the character after the start of the last match
                    startIndex = foundIndex + 1;
                }
            }

            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'redacted-document.pdf';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
            
            toast({
                title: "Download Ready",
                description: "Your redacted PDF has been downloaded.",
            });
        } catch (error) {
            console.error("Failed to create redacted PDF:", error);
            toast({
                variant: 'destructive',
                title: 'Download Error',
                description: 'Could not generate the redacted PDF.',
            });
        } finally {
            setIsDownloading(false);
        }
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
    }, [documentText, redactionTerms, suggestedTerms, isParsing]);


    return (
        <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
                <CardHeader>
                    <CardTitle>Document Viewer</CardTitle>
                    <CardDescription>Select text to redact or use Smart Suggestions. Formatting will be preserved on download.</CardDescription>
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
                            {isParsing ? "Parsing..." : "Upload PDF"}
                        </Button>
                        <Button onClick={handleSuggest} disabled={!documentText || isSuggesting}>
                            {isSuggesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                            Smart Suggestion
                        </Button>
                         <Button onClick={handleDownload} className="w-full" disabled={!originalPdf || redactionTerms.length === 0 || isDownloading}>
                            {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                            Download Redacted PDF
                        </Button>
                    </CardContent>
                    <CardFooter>
                         <Button variant="destructive" className="w-full" onClick={handleReset}><Trash2 className="mr-2 h-4 w-4" /> Reset</Button>
                    </CardFooter>
                </Card>

                {selectedText && (
                    <Card className="animate-in fade-in"><CardHeader><CardTitle>Manual Selection</CardTitle></CardHeader>
                        <CardContent><p className="text-sm font-mono p-2 bg-muted rounded">"{selectedText}"</p></CardContent>
                        <CardFooter className="gap-2"><Button className="w-full" onClick={() => { setRedactionTerms(prev => [...prev, selectedText]); setSelectedText(''); }}>Add to List</Button><Button variant="ghost" size="icon" onClick={() => setSelectedText('')}><X className="h-4 w-4"/></Button></CardFooter>
                    </Card>
                )}
                
                {suggestedTerms.length > 0 && (
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

                {redactionTerms.length > 0 && (
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
