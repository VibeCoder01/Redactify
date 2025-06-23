
"use client";

import React, { useState, useTransition, useMemo, useRef, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { PDFDocument, rgb } from 'pdf-lib';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FileUp, Sparkles, Download, Loader2, X, Check, Trash2 } from "lucide-react";
import { suggestRedactionTerms } from "@/ai/flows/suggest-redaction-terms";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

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
    const [isDownloading, setIsDownloading] = useState<string | null>(null);
    const [isParsing, setIsParsing] = useState(false);
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();

    const [originalPdf, setOriginalPdf] = useState<ArrayBuffer | null>(null);
    const [pdfTextItems, setPdfTextItems] = useState<PdfTextItem[]>([]);

    const allUniqueTerms = useMemo(() => {
        const allTerms = [...new Set([...suggestedTerms, ...redactionTerms])];
        return allTerms.sort((a, b) => a.localeCompare(b));
    }, [suggestedTerms, redactionTerms]);

    const handleFileUpload = async (file: File | null | undefined) => {
        if (!file) {
            return;
        }

        if (file.type !== 'application/pdf') {
            toast({
                variant: 'destructive',
                title: 'Invalid File Type',
                description: 'Please upload a PDF file.',
            });
            return;
        }

        handleReset();
        setIsParsing(true);

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

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        handleFileUpload(event.target.files?.[0]);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(false);
        if (documentText) return;

        handleFileUpload(e.dataTransfer.files?.[0]);
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (!documentText) {
            setIsDraggingOver(true);
        }
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(false);
    };

    const handleSelection = () => {
        const text = window.getSelection()?.toString().trim();
        if (text && !allUniqueTerms.some(t => t.toLowerCase() === text.toLowerCase())) {
            setSelectedText(text);
        } else if (!text) {
            setSelectedText("");
        }
    };
    
    const handleDoubleClick = () => {
        const selection = window.getSelection();
        const text = selection?.toString().trim();

        if (text && !allUniqueTerms.some(t => t.toLowerCase() === text.toLowerCase())) {
            setSuggestedTerms(prev => [...new Set([text, ...prev])]);
            setSelectedText(""); // Prevents manual selection card from appearing

            toast({
                title: "Term Added",
                description: `"${text}" has been added to your identified terms.`,
            });
            
            if(selection) {
                selection.removeAllRanges();
            }
        }
    };

    const handleSuggest = () => {
        startSuggestionTransition(async () => {
            try {
                const result = await suggestRedactionTerms({ text: documentText });
                if (result && result.terms) {
                    const newSuggestions = result.terms.filter(
                        term => !allUniqueTerms.some(t => t.toLowerCase() === term.toLowerCase())
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
    
    const toggleRedactionStatus = useCallback((term: string) => {
        setRedactionTerms(prevTerms => {
            const termExists = prevTerms.some(t => t.toLowerCase() === term.toLowerCase());
            if (termExists) {
                return prevTerms.filter(t => t.toLowerCase() !== term.toLowerCase());
            } else {
                return [...prevTerms, term];
            }
        });
    }, []);

    const handleReset = () => {
        setDocumentText("");
        setSelectedText("");
        setRedactionTerms([]);
        setSuggestedTerms([]);
        setOriginalPdf(null);
        setPdfTextItems([]);
        setIsDownloading(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };
    
    const findMatchingTextItems = (term: string) => {
        const results: PdfTextItem[][] = [];
        const termToSearch = term.toLowerCase();
    
        for (let i = 0; i < pdfTextItems.length; i++) {
            let buffer = '';
            const matchedItems: PdfTextItem[] = [];
    
            for (let j = i; j < pdfTextItems.length; j++) {
                const currentItem = pdfTextItems[j];
                const prevItem = j > i ? pdfTextItems[j - 1] : null;
    
                if (prevItem) {
                    // Break if items are on different pages or not reasonably contiguous
                    if (currentItem.pageIndex !== prevItem.pageIndex) break;
    
                    const yDiff = Math.abs(currentItem.transform[5] - prevItem.transform[5]);
                    const isNewLine = yDiff > currentItem.height * 0.5;
                    if(isNewLine) break;
    
                    const gap = currentItem.transform[4] - (prevItem.transform[4] + prevItem.width);
                    if (gap > currentItem.height) break; // If gap is too large, it's not the same phrase
                    
                    if(gap > 0.1) { // Add a space for small gaps
                        buffer += ' ';
                    }
                }
    
                buffer += currentItem.str;
                matchedItems.push(currentItem);

                // If the buffer now contains the term, we have a potential match
                if (buffer.toLowerCase().includes(termToSearch)) {
                    // To avoid partial matches (e.g. "red" in "redaction"), we do a trick:
                    // we replace the found term in our buffer and see if the remaining parts are small (punctuation, etc.)
                    const remainder = buffer.toLowerCase().replace(termToSearch, '').trim();
                    if (remainder.length < 2) {
                        results.push(matchedItems);
                        i = j; // Skip past the items we just matched
                        break; // Move to the next starting position `i`
                    }
                }
                if (buffer.length > term.length + 20) break;
            }
        }
        return results;
    };

    const handleDownloadRecoverable = async () => {
        if (!originalPdf || redactionTerms.length === 0) return;

        setIsDownloading('recoverable');
        try {
            const pdfDoc = await PDFDocument.load(originalPdf.slice(0));
            const pages = pdfDoc.getPages();
            const allTerms = [...new Set(redactionTerms)];
    
            for (const term of allTerms) {
                const termMatches = findMatchingTextItems(term);
    
                for (const matchedItems of termMatches) {
                    if (matchedItems.length > 0) {
                        const pageIndex = matchedItems[0].pageIndex;
                        const page = pages[pageIndex];
                        let minX = Infinity, maxX = -Infinity, topY = Infinity, bottomY = -Infinity;

                        matchedItems.forEach(item => {
                            const x = item.transform[4];
                            const y = item.transform[5];
                            const w = item.width;
                            const h = item.height;

                            const ascent = h * 0.8;
                            const descent = h * 0.2;

                            minX = Math.min(minX, x);
                            maxX = Math.max(maxX, x + w);
                            topY = Math.min(topY, y - ascent);
                            bottomY = Math.max(bottomY, y + descent);
                        });

                        const boxX = minX - 1;
                        const boxWidth = (maxX - minX) + 2;
                        const boxY = page.getHeight() - bottomY;
                        const boxHeight = bottomY - topY;

                        page.drawRectangle({
                            x: boxX,
                            y: boxY,
                            width: boxWidth,
                            height: boxHeight,
                            color: rgb(0, 0, 0),
                        });
                    }
                }
            }

            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'redacted-document-recoverable.pdf';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);

            toast({
                title: "Download Ready",
                description: "Your recoverable PDF has been downloaded.",
            });
        } catch (error) {
            console.error("Failed to create recoverable redacted PDF:", error);
            toast({
                variant: 'destructive',
                title: 'Download Error',
                description: 'Could not generate the recoverable PDF.',
            });
        } finally {
            setIsDownloading(null);
        }
    };

    const handleDownloadSecure = async (type: 'flattened') => {
        if (!originalPdf || redactionTerms.length === 0) return;
    
        setIsDownloading(type);
        try {
            const newPdfDoc = await PDFDocument.create();
            const pdfToRender = await pdfjsLib.getDocument({ data: originalPdf.slice(0) }).promise;
            const originalPdfDocForCoords = await PDFDocument.load(originalPdf.slice(0));
            const originalPages = originalPdfDocForCoords.getPages();
    
            const redactionAreasByPage: { [pageIndex: number]: { x: number; y: number; width: number; height: number }[] } = {};
            const allTerms = [...new Set(redactionTerms)];
    
            for (const term of allTerms) {
                const termMatches = findMatchingTextItems(term);
    
                for (const matchedItems of termMatches) {
                    if (matchedItems.length > 0) {
                        const pageIndex = matchedItems[0].pageIndex;
                        const page = originalPages[pageIndex];
                        let minX = Infinity, maxX = -Infinity, topY = Infinity, bottomY = -Infinity;

                        matchedItems.forEach(item => {
                            const x = item.transform[4];
                            const y = item.transform[5];
                            const w = item.width;
                            const h = item.height;
                            
                            const ascent = h * 0.8;
                            const descent = h * 0.2;

                            minX = Math.min(minX, x);
                            maxX = Math.max(maxX, x + w);
                            topY = Math.min(topY, y - ascent);
                            bottomY = Math.max(bottomY, y + descent);
                        });
    
                        const boxX = minX - 1;
                        const boxWidth = (maxX - minX) + 2;
                        const boxY = page.getHeight() - bottomY;
                        const boxHeight = bottomY - topY;
    
                        if (!redactionAreasByPage[pageIndex]) {
                            redactionAreasByPage[pageIndex] = [];
                        }
                        redactionAreasByPage[pageIndex].push({ x: boxX, y: boxY, width: boxWidth, height: boxHeight });
                    }
                }
            }
    
            for (let i = 0; i < pdfToRender.numPages; i++) {
                const page = await pdfToRender.getPage(i + 1);
                const viewport = page.getViewport({ scale: 2.0 }); 
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;
    
                if (!context) continue;
    
                await page.render({ canvasContext: context, viewport }).promise;
    
                const redactionAreas = redactionAreasByPage[i] || [];
                context.fillStyle = 'black';
                redactionAreas.forEach(area => {
                    context.fillRect(area.x * viewport.scale, (viewport.height - area.y - area.height) * viewport.scale, area.width * viewport.scale, area.height * viewport.scale);
                });
    
                const imageBytes = await new Promise<Uint8Array>((resolve) => {
                    canvas.toBlob(blob => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
                        reader.readAsArrayBuffer(blob!);
                    }, 'image/png');
                });
    
                const pngImage = await newPdfDoc.embedPng(imageBytes);
                const newPage = newPdfDoc.addPage([viewport.width, viewport.height]);
                newPage.drawImage(pngImage, {
                    x: 0,
                    y: 0,
                    width: viewport.width,
                    height: viewport.height,
                });
            }
    
            const pdfBytes = await newPdfDoc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `redacted-document-${type}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
    
            toast({
                title: "Download Ready",
                description: "Your securely redacted PDF has been downloaded.",
            });
        } catch (error) {
            console.error("Failed to create secure redacted PDF:", error);
            toast({
                variant: 'destructive',
                title: 'Download Error',
                description: 'Could not generate the secure redacted PDF.',
            });
        } finally {
            setIsDownloading(null);
        }
    };

    const highlightedDocument = useMemo(() => {
        if (!documentText && !isParsing) {
            return (
                <div 
                    className="flex items-center justify-center h-full text-center cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                >
                    <div>
                        <FileUp className="mx-auto h-12 w-12 text-muted-foreground" />
                        <h3 className="mt-2 text-sm font-semibold text-foreground">Upload a Document</h3>
                        <p className="mt-1 text-sm text-muted-foreground">Drag & drop or click to upload a PDF.</p>
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

        if (allUniqueTerms.length === 0) {
            return <pre className="whitespace-pre-wrap font-sans text-sm">{documentText}</pre>;
        }

        const regex = new RegExp(`(${allUniqueTerms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
        const parts = documentText.split(regex);

        return (
            <pre className="whitespace-pre-wrap font-sans text-sm">
                {parts.map((part, index) => {
                    const matchedTerm = allUniqueTerms.find(t => t.toLowerCase() === part.toLowerCase());
                    if (matchedTerm) {
                        const isRedacted = redactionTerms.some(rt => rt.toLowerCase() === part.toLowerCase());
                        const className = cn(
                            'rounded px-0.5 py-0.5 cursor-pointer',
                            isRedacted ? 'bg-primary/30 line-through' : 'bg-accent/30 hover:bg-accent/50'
                        );
                        return <mark key={index} className={className} onClick={() => toggleRedactionStatus(part)}>{part}</mark>;
                    }
                    return <span key={index}>{part}</span>;
                })}
            </pre>
        );
    }, [documentText, redactionTerms, allUniqueTerms, isParsing, toggleRedactionStatus]);


    return (
        <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
                <CardHeader>
                    <CardTitle>Document Viewer</CardTitle>
                    <CardDescription>Select text to redact or use Smart Suggestions. Formatting will be preserved on download.</CardDescription>
                </CardHeader>
                <CardContent 
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    className={cn("transition-colors", isDraggingOver && !documentText && "bg-primary/10")}
                >
                    <ScrollArea className="h-[60vh] w-full rounded-md border bg-muted/20 p-4" onMouseUp={handleSelection} onClick={handleSelection} onDoubleClick={handleDoubleClick}>
                        {highlightedDocument}
                    </ScrollArea>
                </CardContent>
            </Card>

            <div className="lg:col-span-1 flex flex-col gap-6">
                <Card>
                    <CardHeader><CardTitle>Controls</CardTitle></CardHeader>
                    <CardContent className="flex flex-col gap-4">
                        <Button onClick={handleSuggest} disabled={!documentText || isSuggesting}>
                            {isSuggesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                            Suggest
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button className="w-full" disabled={!originalPdf || redactionTerms.length === 0 || !!isDownloading}>
                                    {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                                    Download PDF
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width]">
                                <DropdownMenuItem onClick={() => handleDownloadRecoverable()} disabled={!!isDownloading}>
                                    Recoverable
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleDownloadSecure('flattened')} disabled={!!isDownloading}>
                                    Secure (Flattened)
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                         <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            style={{ display: 'none' }}
                            accept="application/pdf"
                        />
                    </CardContent>
                    <CardFooter>
                         <Button variant="destructive" className="w-full" onClick={handleReset}><Trash2 className="mr-2 h-4 w-4" /> Reset</Button>
                    </CardFooter>
                </Card>

                {selectedText && (
                    <Card className="animate-in fade-in"><CardHeader><CardTitle>Manual Selection</CardTitle></CardHeader>
                        <CardContent><p className="text-sm font-mono p-2 bg-muted rounded">"{selectedText}"</p></CardContent>
                        <CardFooter className="gap-2">
                            <Button className="w-full" onClick={() => {
                                setSuggestedTerms(prev => [...new Set([...prev, selectedText])]);
                                setRedactionTerms(prev => [...new Set([...prev, selectedText])]);
                                setSelectedText('');
                            }}>Add to Redaction List</Button>
                            <Button variant="ghost" size="icon" onClick={() => setSelectedText('')}><X className="h-4 w-4"/></Button>
                        </CardFooter>
                    </Card>
                )}
                
                {allUniqueTerms.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Identified Terms</CardTitle>
                            <CardDescription>Click to toggle redaction. Struck-through terms will be redacted.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ScrollArea className="h-40">
                                <div className="flex flex-wrap gap-2">
                                    {allUniqueTerms.map((term, i) => {
                                        const isRedacted = redactionTerms.some(rt => rt.toLowerCase() === term.toLowerCase());
                                        return (
                                            <Badge
                                                key={i}
                                                variant={isRedacted ? "default" : "outline"}
                                                className={cn(
                                                    "text-base font-normal cursor-pointer transition-all",
                                                    isRedacted 
                                                        ? "line-through decoration-2 hover:bg-primary/80" 
                                                        : "hover:bg-accent/20"
                                                )}
                                                onClick={() => toggleRedactionStatus(term)}
                                            >
                                                {term}
                                            </Badge>
                                        );
                                    })}
                                </div>
                            </ScrollArea>
                        </CardContent>
                         <CardFooter>
                             <p className="text-sm text-muted-foreground">{redactionTerms.length} of {allUniqueTerms.length} terms will be redacted.</p>
                        </CardFooter>
                    </Card>
                )}

            </div>
        </div>
    );
}
