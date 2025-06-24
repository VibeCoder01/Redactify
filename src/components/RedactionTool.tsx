
"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { PDFDocument, rgb, PDFName, PDFArray } from 'pdf-lib';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FileUp, Download, Loader2, Trash2, ChevronLeft, ChevronRight, Eraser, Undo2, Layers } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

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

interface AnnotationInfo {
    pageIndex: number;
    rect: [number, number, number, number];
    id?: string;
}

const PAN_SPEED = 50;

export function RedactionTool() {
    const [originalPdf, setOriginalPdf] = useState<ArrayBuffer | null>(null);
    const [pdfDocument, setPdfDocument] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
    const [redactions, setRedactions] = useState<RedactionArea[]>([]);
    
    const [currentPageNumber, setCurrentPageNumber] = useState(1);
    const [isDrawing, setIsDrawing] = useState(false);
    const [drawStartPoint, setDrawStartPoint] = useState<{ x: number, y: number } | null>(null);
    const [currentDrawing, setCurrentDrawing] = useState<Omit<RedactionArea, "pageIndex"> | null>(null);
    const [hoveredRedactionIndex, setHoveredRedactionIndex] = useState<number | null>(null);
    const [pageViewport, setPageViewport] = useState<pdfjsLib.PageViewport | null>(null);

    const [isDownloading, setIsDownloading] = useState<string | null>(null);
    const [isParsing, setIsParsing] = useState(false);
    const [isProcessingAnnotations, setIsProcessingAnnotations] = useState(false);
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
    
    const [allAnnotations, setAllAnnotations] = useState<AnnotationInfo[]>([]);
    const [isHighlightingAnnotations, setIsHighlightingAnnotations] = useState(false);
    const [currentAnnotationIndex, setCurrentAnnotationIndex] = useState(-1);
    const [isFlashing, setIsFlashing] = useState(false);
    
    const fileInputRef = useRef<HTMLInputElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const interactionRef = useRef<HTMLDivElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);

    const { toast } = useToast();
    
    const totalPages = pdfDocument?.numPages ?? 0;

    const scanForAnnotations = async (pdf: pdfjsLib.PDFDocumentProxy) => {
        const annotationsList: AnnotationInfo[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
            try {
                const page = await pdf.getPage(i);
                const annotations = await page.getAnnotations();
                annotations.forEach((annot) => {
                    annotationsList.push({
                        pageIndex: i, // pdf.js page numbers are 1-based
                        rect: annot.rect,
                        id: annot.id,
                    });
                });
            } catch (error) {
                // Silently fail
            }
        }
        setAllAnnotations(annotationsList);
    };

    const renderPage = useCallback(async (pageNum: number) => {
        if (!pdfDocument || !canvasRef.current) return;
    
        const page = await pdfDocument.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.0 });
        setPageViewport(viewport);
    
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        
        canvas.height = viewport.height;
        canvas.width = viewport.width;
    
        if (context) {
            // Render the PDF page first
            await page.render({ canvasContext: context, viewport }).promise;
    
            // If highlighting is enabled, draw annotations on top
            if (isHighlightingAnnotations) {
                const annotations = await page.getAnnotations();
                annotations.forEach(annotation => {
                    // We only care about annotations with a rectangle
                    if (!annotation.rect) {
                        return;
                    }

                    const [x1, y1, x2, y2] = annotation.rect;

                    // Convert PDF coordinates to canvas coordinates
                    const p1 = viewport.convertToViewportPoint(x1, y1);
                    const p2 = viewport.convertToViewportPoint(x2, y2);

                    const canvasX = Math.min(p1[0], p2[0]);
                    const canvasY = Math.min(p1[1], p2[1]);
                    const width = Math.abs(p1[0] - p2[0]);
                    const height = Math.abs(p1[1] - p2[1]);
                    
                    // Draw a semi-transparent box to represent the annotation
                    context.fillStyle = 'hsla(174, 100%, 29%, 0.4)';
                    context.fillRect(canvasX, canvasY, width, height);

                    // Also add a border to make it clearer
                    context.strokeStyle = 'hsl(174, 100%, 29%)';
                    context.lineWidth = 1;
                    context.strokeRect(canvasX, canvasY, width, height);
                });
            }
        }
    
    }, [pdfDocument, isHighlightingAnnotations]);

    useEffect(() => {
        if (pdfDocument) {
            renderPage(currentPageNumber);
        }
    }, [pdfDocument, currentPageNumber, renderPage, isHighlightingAnnotations]);

    useEffect(() => {
        if (pdfDocument) {
            setPanOffset({ x: 0, y: 0 });
        }
    }, [pdfDocument, currentPageNumber]);

    const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
        if (!pdfDocument) return;
        e.preventDefault();
        setPanOffset(p => ({
            x: p.x - e.deltaX,
            y: p.y - e.deltaY,
        }));
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!pdfDocument) return;

            e.preventDefault();
            switch (e.key) {
                case 'ArrowUp':
                    setPanOffset(p => ({ ...p, y: p.y + PAN_SPEED }));
                    break;
                case 'ArrowDown':
                    setPanOffset(p => ({ ...p, y: p.y - PAN_SPEED }));
                    break;
                case 'ArrowLeft':
                    setPanOffset(p => ({ ...p, x: p.x + PAN_SPEED }));
                    break;
                case 'ArrowRight':
                    setPanOffset(p => ({ ...p, x: p.x - PAN_SPEED }));
                    break;
            }
        };

        const viewportElement = viewportRef.current;
        if (viewportElement) {
            viewportElement.addEventListener('keydown', handleKeyDown);
            viewportElement.focus();
        }

        return () => {
            if (viewportElement) {
                viewportElement.removeEventListener('keydown', handleKeyDown);
            }
        };
    }, [pdfDocument]);

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
                    const bufferForParsing = buffer.slice(0);
                    const pdf = await pdfjsLib.getDocument({ data: bufferForParsing }).promise;
                    setOriginalPdf(buffer);
                    setPdfDocument(pdf);
                    setCurrentPageNumber(1);
                    await scanForAnnotations(pdf);
                    toast({ title: 'PDF Loaded', description: `"${file.name}" has been loaded successfully.` });
                } catch (error: any) {
                    if (error.name === 'PasswordException') {
                        toast({ variant: 'destructive', title: 'Encrypted PDF', description: 'This document is password-protected and cannot be loaded.' });
                    } else {
                        toast({ variant: 'destructive', title: 'PDF Parsing Error', description: 'Could not read the content of the PDF file.' });
                    }
                    handleReset();
                } finally {
                    setIsParsing(false);
                }
            }
        };
        reader.onerror = () => {
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

    const getMousePos = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!canvasRef.current) return {x: 0, y: 0};
        const rect = canvasRef.current.getBoundingClientRect();
        return {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        };
    }

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!canvasRef.current || !pdfDocument) return;
        e.preventDefault();
        e.stopPropagation();
        setIsDrawing(true);
        setDrawStartPoint(getMousePos(e));
    };
    
    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isDrawing || !drawStartPoint || !canvasRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        const currentPos = getMousePos(e);
    
        const x = Math.min(drawStartPoint.x, currentPos.x);
        const y = Math.min(drawStartPoint.y, currentPos.y);
        const width = Math.abs(currentPos.x - drawStartPoint.x);
        const height = Math.abs(currentPos.y - drawStartPoint.y);
        setCurrentDrawing({ x, y, width, height });
    };

    const handleMouseUp = async (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isDrawing || !currentDrawing || !pdfDocument || !canvasRef.current || !pageViewport) return;
        e.preventDefault();
        e.stopPropagation();
        
        const renderScale = canvasRef.current.width / pageViewport.width;

        const pdfCoords = {
            x: currentDrawing.x / renderScale,
            y: (canvasRef.current.height - (currentDrawing.y + currentDrawing.height)) / renderScale,
            width: currentDrawing.width / renderScale,
            height: currentDrawing.height / renderScale
        };

        setRedactions(prev => [...prev, { ...pdfCoords, pageIndex: currentPageNumber - 1 }]);
        
        setIsDrawing(false);
        setDrawStartPoint(null);
        setCurrentDrawing(null);
        viewportRef.current?.focus();
    };

    const handleReset = () => {
        setOriginalPdf(null);
        setPdfDocument(null);
        setRedactions([]);
        setCurrentPageNumber(1);
        setIsDownloading(null);
        setPanOffset({x: 0, y: 0});
        setAllAnnotations([]);
        setIsHighlightingAnnotations(false);
        setCurrentAnnotationIndex(-1);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleUndo = () => {
        setRedactions(prev => prev.slice(0, -1));
        viewportRef.current?.focus();
    };
    
    const handleRemoveSingleRedaction = (e: React.MouseEvent, indexToRemove: number) => {
        e.preventDefault();
        setRedactions(prev => prev.filter((_, i) => i !== indexToRemove));
    };

    const handleRemoveAnnotations = async () => {
        if (!originalPdf) return;
    
        setIsProcessingAnnotations(true);
        try {
            const pdfDoc = await PDFDocument.load(originalPdf.slice(0));
            const pages = pdfDoc.getPages();
            let annotationsRemoved = 0;
    
            for (const page of pages) {
                const annots = page.node.lookup(PDFName.of('Annots'));
                if (annots instanceof PDFArray) {
                    annotationsRemoved += annots.size();
                    page.node.delete(PDFName.of('Annots'));
                }
            }
            
            if (annotationsRemoved > 0) {
                const modifiedPdfBytes = await pdfDoc.save();
                
                setOriginalPdf(modifiedPdfBytes);
                const pdf = await pdfjsLib.getDocument({ data: modifiedPdfBytes.slice(0) }).promise;
                setPdfDocument(pdf);
                setRedactions([]);
                setAllAnnotations([]);
                setCurrentAnnotationIndex(-1);
                setCurrentPageNumber(1);
                await scanForAnnotations(pdf);
                toast({ title: "Annotations Removed", description: `${annotationsRemoved} annotations were removed from the document.` });
            } else {
                toast({ title: "No Annotations Found", description: "No removable annotations were found in the document." });
            }
    
        } catch (error: any) {
            if (error.constructor.name === 'EncryptedPDFError') {
                toast({ variant: 'destructive', title: 'Encrypted PDF', description: 'This document is encrypted and cannot be modified.' });
            } else {
                toast({ variant: 'destructive', title: 'Processing Error', description: 'Could not remove annotations from the PDF.' });
            }
        } finally {
            setIsProcessingAnnotations(false);
        }
    };

    const triggerFlash = () => {
        setIsFlashing(true);
        setTimeout(() => setIsFlashing(false), 1000);
    };
    
    const handleHighlightToggle = (checked: boolean) => {
        setIsHighlightingAnnotations(checked);
        if (checked && allAnnotations.length > 0) {
            setCurrentAnnotationIndex(0);
            const firstAnnotation = allAnnotations[0];
            setCurrentPageNumber(firstAnnotation.pageIndex);
            triggerFlash();
            toast({
                title: "Navigated to Annotation",
                description: `Moved to page ${firstAnnotation.pageIndex} to show the first annotation.`,
            });
        } else if (!checked) {
            setCurrentAnnotationIndex(-1);
        }
    };

    const handleNextAnnotation = () => {
        if (allAnnotations.length === 0) return;
        const nextIndex = (currentAnnotationIndex + 1) % allAnnotations.length;
        setCurrentAnnotationIndex(nextIndex);
        const nextAnnotation = allAnnotations[nextIndex];
        setCurrentPageNumber(nextAnnotation.pageIndex);
        triggerFlash();
    };

    const handlePrevAnnotation = () => {
        if (allAnnotations.length === 0) return;
        const prevIndex = (currentAnnotationIndex - 1 + allAnnotations.length) % allAnnotations.length;
        setCurrentAnnotationIndex(prevIndex);
        const prevAnnotation = allAnnotations[prevIndex];
        setCurrentPageNumber(prevAnnotation.pageIndex);
        triggerFlash();
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
            toast({ title: "Download Ready", description: "The recoverable PDF has been downloaded." });
        } catch (error: any) {
            if (error.constructor.name === 'EncryptedPDFError') {
                toast({ variant: 'destructive', title: 'Encrypted PDF', description: 'This document is encrypted and cannot be modified.' });
            } else {
                toast({ variant: 'destructive', title: 'Download Error', description: 'Could not generate the recoverable PDF.' });
            }
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
    
                const pageRedactions = redactions.filter(r => r.pageIndex === i);
                context.fillStyle = 'black';

                const pageViewport = page.getViewport({ scale: 1.0 });
                const renderScale = canvas.width / pageViewport.width;

                pageRedactions.forEach(r => {
                    const canvasX = r.x * renderScale;
                    const canvasY = canvas.height - (r.y + r.height) * renderScale;
                    const canvasWidth = r.width * renderScale;
                    const canvasHeight = r.height * renderScale;
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

    return (
        <div className="flex flex-col gap-6">
            <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
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
                                {redactions.length > 0 && (
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground border-l pl-4">
                                        <span>{redactions.length} {redactions.length === 1 ? 'object' : 'objects'}</span>
                                    </div>
                                )}
                                <p className="text-sm text-muted-foreground hidden md:block">Click and drag to redact. Use arrow keys or trackpad to navigate.</p>
                            </div>
                        ) : (
                             <p className="text-sm text-muted-foreground">Upload a PDF to begin.</p>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {pdfDocument && (
                            <>
                                <Button variant="outline" onClick={handleUndo} disabled={redactions.length === 0 || !!isDownloading || isProcessingAnnotations}>
                                    <Undo2 className="mr-2 h-4 w-4"/> Undo
                                </Button>
                                <Button variant="outline" onClick={() => setRedactions([])} disabled={redactions.length === 0 || !!isDownloading || isProcessingAnnotations}>
                                    <Eraser className="mr-2 h-4 w-4"/> Clear All
                                </Button>
                                {allAnnotations.length > 0 && (
                                    <div className="flex items-center gap-2 border-l pl-4">
                                        <Switch
                                            id="highlight-annotations"
                                            checked={isHighlightingAnnotations}
                                            onCheckedChange={handleHighlightToggle}
                                            disabled={allAnnotations.length === 0}
                                            aria-label="Highlight annotations"
                                        />
                                        <Label htmlFor="highlight-annotations" className="text-sm text-muted-foreground cursor-pointer">
                                            Highlight Annotations
                                        </Label>
                                        {isHighlightingAnnotations && allAnnotations.length > 0 && (
                                            <div className="flex items-center gap-1">
                                                <Button variant="outline" size="icon" onClick={handlePrevAnnotation} disabled={allAnnotations.length <= 1}>
                                                    <ChevronLeft className="h-4 w-4" />
                                                </Button>
                                                <span className="text-sm text-muted-foreground w-20 text-center">
                                                    {currentAnnotationIndex + 1} of {allAnnotations.length}
                                                </span>
                                                <Button variant="outline" size="icon" onClick={handleNextAnnotation} disabled={allAnnotations.length <= 1}>
                                                    <ChevronRight className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                )}
                                <TooltipProvider>
                                    <Tooltip delayDuration={100}>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="outline"
                                                onClick={handleRemoveAnnotations}
                                                disabled={isProcessingAnnotations || !!isDownloading || allAnnotations.length === 0}
                                            >
                                                {isProcessingAnnotations ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Layers className="mr-2 h-4 w-4" />}
                                                Remove Annotations
                                            </Button>
                                        </TooltipTrigger>
                                        {allAnnotations.length > 0 && (
                                            <TooltipContent>
                                                <p>Removes {allAnnotations.length} annotation {allAnnotations.length === 1 ? 'object' : 'objects'}.</p>
                                            </TooltipContent>
                                        )}
                                    </Tooltip>
                                </TooltipProvider>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button disabled={!originalPdf || redactions.length === 0 || !!isDownloading || isProcessingAnnotations}>
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
                         <Button variant="destructive" onClick={handleReset} disabled={!pdfDocument && !isParsing}>
                            <Trash2 className="mr-2 h-4 w-4" /> Reset
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card>
                 <div
                    ref={viewportRef}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onWheel={handleWheel}
                    tabIndex={-1}
                    className={cn(
                        "transition-colors relative p-0 h-[70vh] w-full rounded-md border bg-muted/20 overflow-hidden focus:outline-none",
                        { "flash-effect": isFlashing }
                    )}
                 >
                    {pdfDocument && (
                         <div
                            className="relative transition-transform duration-100 ease-out"
                            style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px)` }}
                        >
                            <div
                                ref={interactionRef}
                                className="relative cursor-crosshair"
                                onMouseDown={handleMouseDown}
                                onMouseMove={handleMouseMove}
                                onMouseUp={handleMouseUp}
                                onMouseLeave={() => { if(isDrawing) handleMouseUp;}}
                            >
                                <canvas ref={canvasRef} />

                                {isDrawing && currentDrawing && (
                                    <div
                                        className="absolute border-2 border-dashed border-primary bg-primary/20 pointer-events-none"
                                        style={{
                                            left: currentDrawing.x,
                                            top: currentDrawing.y,
                                            width: currentDrawing.width,
                                            height: currentDrawing.height,
                                        }}
                                    />
                                )}
                                {pageViewport && canvasRef.current && redactions
                                    .filter(r => r.pageIndex === currentPageNumber - 1)
                                    .map((r, index) => {
                                        const renderScale = canvasRef.current!.width / pageViewport.width;

                                        const canvasX = r.x * renderScale;
                                        const canvasY = canvasRef.current!.height - (r.y + r.height) * renderScale;
                                        const canvasWidth = r.width * renderScale;
                                        const canvasHeight = r.height * renderScale;

                                        return (
                                            <div
                                                key={index}
                                                onMouseEnter={() => setHoveredRedactionIndex(index)}
                                                onMouseLeave={() => setHoveredRedactionIndex(null)}
                                                onContextMenu={(e) => handleRemoveSingleRedaction(e, index)}
                                                className={cn(
                                                    "absolute bg-black/70 cursor-pointer",
                                                    "transition-all duration-150",
                                                    {
                                                        "ring-2 ring-primary ring-offset-2 ring-offset-background shadow-lg": hoveredRedactionIndex === index
                                                    }
                                                )}
                                                style={{
                                                    left: canvasX,
                                                    top: canvasY,
                                                    width: canvasWidth,
                                                    height: canvasHeight,
                                                }}
                                            />
                                        );
                                    })
                                }
                                {isHighlightingAnnotations && currentAnnotationIndex > -1 && allAnnotations.length > 0 && pageViewport && canvasRef.current && (() => {
                                        const annotation = allAnnotations[currentAnnotationIndex];
                                        if (annotation.pageIndex !== currentPageNumber) return null;

                                        const [x1, y1, x2, y2] = annotation.rect;
                                        const rect = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };

                                        const renderScale = canvasRef.current!.width / pageViewport.width;
                                        const canvasX = rect.x * renderScale;
                                        const canvasY = canvasRef.current!.height - (rect.y + rect.height) * renderScale;
                                        const canvasWidth = rect.width * renderScale;
                                        const canvasHeight = rect.height * renderScale;

                                        return (
                                            <div
                                                className="absolute border-2 border-dashed border-accent pointer-events-none"
                                                style={{
                                                    left: canvasX,
                                                    top: canvasY,
                                                    width: canvasWidth,
                                                    height: canvasHeight,
                                                }}
                                            />
                                        );
                                    })()}
                            </div>
                        </div>
                    )}

                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                        {isParsing ? (
                            <div className="bg-background/80 p-8 rounded-md">
                                <Loader2 className="h-12 w-12 text-muted-foreground animate-spin" />
                                <h3 className="mt-4 text-lg font-semibold text-foreground">Parsing PDF...</h3>
                                <p className="mt-1 text-muted-foreground">Please wait while we process your document.</p>
                            </div>
                        ) : isDraggingOver && !pdfDocument ? (
                            <div className="bg-background/80 p-8 rounded-md">
                                <FileUp className="h-12 w-12 text-muted-foreground" />
                                <h3 className="mt-4 text-lg font-semibold text-foreground">Drop to Upload</h3>
                            </div>
                        ) : !pdfDocument ? (
                            <div
                                className="h-full w-full flex flex-col items-center justify-center cursor-pointer pointer-events-auto"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <FileUp className="mx-auto h-12 w-12 text-muted-foreground" />
                                <h3 className="mt-2 text-sm font-semibold text-foreground">Upload a Document</h3>
                                <p className="mt-1 text-sm text-muted-foreground">Drag & drop or click to upload a PDF.</p>

                            </div>
                        ) : null}
                    </div>
                </div>
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
