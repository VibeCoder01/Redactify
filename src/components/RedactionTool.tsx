
"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { PDFDocument, rgb } from 'pdf-lib';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FileUp, Download, Loader2, Trash2, ChevronLeft, ChevronRight, Eraser } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

if (typeof window !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

interface RedactionArea {
    pageIndex: number;
    x: number;
    y: number;
    width: number;
    height: number;
}

export function RedactionTool() {
    const [originalPdf, setOriginalPdf] = useState<ArrayBuffer | null>(null);
    const [pdfDocument, setPdfDocument] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
    const [redactions, setRedactions] = useState<RedactionArea[]>([]);
    
    const [currentPageNumber, setCurrentPageNumber] = useState(1);
    const [isDrawing, setIsDrawing] = useState(false);
    const [drawStartPoint, setDrawStartPoint] = useState<{ x: number, y: number } | null>(null);
    const [currentDrawing, setCurrentDrawing] = useState<Omit<RedactionArea, "pageIndex"> | null>(null);

    const [isDownloading, setIsDownloading] = useState<string | null>(null);
    const [isParsing, setIsParsing] = useState(false);
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    
    const fileInputRef = useRef<HTMLInputElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const interactionRef = useRef<HTMLDivElement>(null);
    const { toast } = useToast();
    
    const totalPages = pdfDocument?.numPages ?? 0;

    const renderPage = useCallback(async (pageNum: number) => {
        if (!pdfDocument || !canvasRef.current) return;
        
        const page = await pdfDocument.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        if (context) {
            await page.render({ canvasContext: context, viewport }).promise;

            context.fillStyle = 'rgba(0, 0, 0, 0.7)';
            redactions
                .filter(r => r.pageIndex === pageNum - 1)
                .forEach(r => {
                    // `r` is in PDF points (origin bottom-left). Convert to canvas coords (origin top-left).
                    const canvasX = r.x * viewport.scale;
                    const canvasY = viewport.height - (r.y + r.height) * viewport.scale;
                    const canvasWidth = r.width * viewport.scale;
                    const canvasHeight = r.height * viewport.scale;
                    context.fillRect(canvasX, canvasY, canvasWidth, canvasHeight);
                });
        }
    }, [pdfDocument, redactions]);

    useEffect(() => {
        if (pdfDocument) {
            renderPage(currentPageNumber);
        }
    }, [pdfDocument, currentPageNumber, renderPage, redactions]);

    const handleFileUpload = async (file: File | null | undefined) => {
        if (!file) return;

        if (file.type !== 'application/pdf') {
            toast({ variant: 'destructive', title: 'Invalid File Type', description: 'Please upload a PDF file.' });
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
                    setPdfDocument(pdf);
                    setCurrentPageNumber(1);
                    toast({ title: 'PDF Loaded', description: `"${file.name}" has been loaded successfully.` });
                } catch (error) {
                    console.error("Failed to parse PDF:", error);
                    toast({ variant: 'destructive', title: 'PDF Parsing Error', description: 'Could not read the content of the PDF file.' });
                } finally {
                    setIsParsing(false);
                }
            }
        };
        reader.onerror = () => {
            console.error('FileReader error');
            toast({ variant: 'destructive', title: 'File Read Error', description: 'There was an error reading the file.' });
            setIsParsing(false);
        };
        reader.readAsArrayBuffer(file);
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        handleFileUpload(event.target.files?.[0]);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(false);
        if (isParsing || pdfDocument) return;
        handleFileUpload(e.dataTransfer.files?.[0]);
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isParsing && !pdfDocument) setIsDraggingOver(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(false);
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!interactionRef.current || !pdfDocument) return;
        const scrollContainer = interactionRef.current.parentElement;
        if (!scrollContainer) return;
        const rect = interactionRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left + scrollContainer.scrollLeft;
        const y = e.clientY - rect.top + scrollContainer.scrollTop;
        setIsDrawing(true);
        setDrawStartPoint({ x, y });
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isDrawing || !drawStartPoint || !interactionRef.current) return;
        const scrollContainer = interactionRef.current.parentElement;
        if (!scrollContainer) return;
        const rect = interactionRef.current.getBoundingClientRect();
        const currentX = e.clientX - rect.left + scrollContainer.scrollLeft;
        const currentY = e.clientY - rect.top + scrollContainer.scrollTop;

        const x = Math.min(drawStartPoint.x, currentX);
        const y = Math.min(drawStartPoint.y, currentY);
        const width = Math.abs(currentX - drawStartPoint.x);
        const height = Math.abs(currentY - drawStartPoint.y);
        setCurrentDrawing({ x, y, width, height });
    };

    const handleMouseUp = async () => {
        if (!isDrawing || !currentDrawing || !pdfDocument || !canvasRef.current) return;
        
        const page = await pdfDocument.getPage(currentPageNumber);
        const renderViewport = page.getViewport({ scale: 2.0 });
        
        const scaleX = canvasRef.current.width / renderViewport.width;
        const scaleY = canvasRef.current.height / renderViewport.height;

        // Transform from screen canvas coords to PDF points (origin bottom-left)
        const pdfCoords = {
            x: currentDrawing.x / scaleX,
            y: (canvasRef.current.height - (currentDrawing.y + currentDrawing.height)) / scaleY,
            width: currentDrawing.width / scaleX,
            height: currentDrawing.height / scaleY
        };

        setRedactions(prev => [...prev, { ...pdfCoords, pageIndex: currentPageNumber - 1 }]);
        
        setIsDrawing(false);
        setDrawStartPoint(null);
        setCurrentDrawing(null);
    };

    const handleReset = () => {
        setOriginalPdf(null);
        setPdfDocument(null);
        setRedactions([]);
        setCurrentPageNumber(1);
        setIsDownloading(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };
    
    const applyRedactionsToPdf = async (pdfDoc: PDFDocument) => {
        const pages = pdfDoc.getPages();
        redactions.forEach(r => {
            if (r.pageIndex < pages.length) {
                const page = pages[r.pageIndex];
                page.drawRectangle({
                    ...r,
                    color: rgb(0, 0, 0),
                });
            }
        });
    }

    const handleDownloadRecoverable = async () => {
        if (!originalPdf || redactions.length === 0) return;

        setIsDownloading('recoverable');
        try {
            const pdfDoc = await PDFDocument.load(originalPdf.slice(0));
            await applyRedactionsToPdf(pdfDoc);
            const pdfBytes = await pdfDoc.save();
            downloadPdf(pdfBytes, 'redacted-document-recoverable.pdf');
            toast({ title: "Download Ready", description: "Your recoverable PDF has been downloaded." });
        } catch (error) {
            console.error("Failed to create recoverable redacted PDF:", error);
            toast({ variant: 'destructive', title: 'Download Error', description: 'Could not generate the recoverable PDF.' });
        } finally {
            setIsDownloading(null);
        }
    };

    const handleDownloadSecure = async () => {
        if (!originalPdf || redactions.length === 0) return;
    
        setIsDownloading('flattened');
        try {
            const newPdfDoc = await PDFDocument.create();
            const pdfToRender = await pdfjsLib.getDocument({ data: originalPdf.slice(0) }).promise;
    
            for (let i = 0; i < pdfToRender.numPages; i++) {
                const page = await pdfToRender.getPage(i + 1);
                const viewport = page.getViewport({ scale: 2.0 }); 
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;
    
                if (!context) continue;
    
                await page.render({ canvasContext: context, viewport }).promise;
    
                // Draw redactions for this page onto the canvas
                const pageRedactions = redactions.filter(r => r.pageIndex === i);
                context.fillStyle = 'black';
                pageRedactions.forEach(r => {
                    const canvasX = r.x * viewport.scale;
                    const canvasY = viewport.height - (r.y + r.height) * viewport.scale;
                    const canvasWidth = r.width * viewport.scale;
                    const canvasHeight = r.height * viewport.scale;
                    context.fillRect(canvasX, canvasY, canvasWidth, canvasHeight);
                });
    
                const imageBytes = await new Promise<Uint8Array>((resolve) => {
                    canvas.toBlob(blob => {
                        if (!blob) {
                            resolve(new Uint8Array());
                            return;
                        }
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
                        reader.readAsArrayBuffer(blob);
                    }, 'image/png');
                });
    
                if (imageBytes.length > 0) {
                    const pngImage = await newPdfDoc.embedPng(imageBytes);
                    const newPage = newPdfDoc.addPage([viewport.width, viewport.height]);
                    newPage.drawImage(pngImage, { x: 0, y: 0, width: viewport.width, height: viewport.height });
                }
            }
    
            const pdfBytes = await newPdfDoc.save();
            downloadPdf(pdfBytes, 'redacted-document-secure.pdf');
            toast({ title: "Download Ready", description: "Your securely redacted PDF has been downloaded." });
        } catch (error) {
            console.error("Failed to create secure redacted PDF:", error);
            toast({ variant: 'destructive', title: 'Download Error', description: 'Could not generate the secure PDF.' });
        } finally {
            setIsDownloading(null);
        }
    };
    
    const downloadPdf = (bytes: Uint8Array, filename: string) => {
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    };

    const documentViewer = (
        <>
            {(isParsing || (isDraggingOver && !pdfDocument)) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 z-10 rounded-md">
                    {isParsing ? (
                        <>
                            <Loader2 className="h-12 w-12 text-muted-foreground animate-spin" />
                            <h3 className="mt-4 text-lg font-semibold text-foreground">Parsing PDF...</h3>
                            <p className="mt-1 text-muted-foreground">Please wait while we process your document.</p>
                        </>
                    ) : (
                        <>
                            <FileUp className="h-12 w-12 text-muted-foreground" />
                            <h3 className="mt-4 text-lg font-semibold text-foreground">Drop to Upload</h3>
                        </>
                    )}
                </div>
            )}
            {!pdfDocument && !isParsing && (
                <div 
                    className="flex h-full min-h-[60vh] items-center justify-center text-center cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                >
                    <div>
                        <FileUp className="mx-auto h-12 w-12 text-muted-foreground" />
                        <h3 className="mt-2 text-sm font-semibold text-foreground">Upload a Document</h3>
                        <p className="mt-1 text-sm text-muted-foreground">Drag & drop or click to upload a PDF.</p>
                    </div>
                </div>
            )}
            {pdfDocument && (
                 <div ref={interactionRef} className="relative h-full cursor-crosshair" onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
                    <canvas ref={canvasRef} />
                    {isDrawing && currentDrawing && (
                        <div className="absolute border-2 border-dashed border-primary bg-primary/20 pointer-events-none"
                            style={{
                                left: currentDrawing.x,
                                top: currentDrawing.y,
                                width: currentDrawing.width,
                                height: currentDrawing.height
                            }}
                        />
                    )}
                 </div>
            )}
        </>
    );

    return (
        <div className="flex flex-col gap-6">
            <Card>
                <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-4">
                        {pdfDocument ? (
                             <div className="flex items-center gap-x-4">
                                <div className="flex items-center gap-2">
                                    <Button variant="outline" size="icon" onClick={() => setCurrentPageNumber(p => Math.max(1, p - 1))} disabled={currentPageNumber <= 1}>
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <span className="text-sm text-muted-foreground">Page {currentPageNumber} of {totalPages}</span>
                                    <Button variant="outline" size="icon" onClick={() => setCurrentPageNumber(p => Math.min(totalPages, p + 1))} disabled={currentPageNumber >= totalPages}>
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                                <p className="text-sm text-muted-foreground hidden md:block">Click and drag on the document to draw redaction boxes.</p>
                            </div>
                        ) : (
                             <p className="text-sm text-muted-foreground">Upload a PDF by clicking or dragging into the area below.</p>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {pdfDocument && (
                            <>
                                <Button variant="outline" onClick={() => setRedactions([])} disabled={redactions.length === 0}>
                                    <Eraser className="mr-2 h-4 w-4"/> Clear All
                                </Button>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button disabled={!originalPdf || redactions.length === 0 || !!isDownloading}>
                                            {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                                            Download PDF
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent>
                                        <DropdownMenuItem onClick={handleDownloadRecoverable} disabled={!!isDownloading}>
                                            Recoverable
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={handleDownloadSecure} disabled={!!isDownloading}>
                                            Secure (Flattened)
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </>
                        )}
                        <Button variant="destructive" onClick={handleReset} disabled={!pdfDocument}>
                            <Trash2 className="mr-2 h-4 w-4" /> Reset
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardContent 
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    className={cn("transition-colors relative p-0")}
                >
                    <ScrollArea className="h-[70vh] w-full rounded-md border bg-muted/20 flex items-center justify-center">
                        {documentViewer}
                    </ScrollArea>
                </CardContent>
            </Card>

            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                style={{ display: 'none' }}
                accept="application/pdf"
            />
        </div>
    );
}
