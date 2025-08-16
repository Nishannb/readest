import { useEffect, useRef, useCallback } from 'react';
import { useBookDataStore } from '@/store/bookDataStore';
import { useSettingsStore } from '@/store/settingsStore';
import { BookNote } from '@/types/book';
import { uniqueId } from '@/utils/misc';

export const usePDFAnnotations = (bookKey: string, view: any) => {
    const { getConfig, setConfig, saveConfig } = useBookDataStore();
    const { settings } = useSettingsStore();
    const pdfAnnotationHandler = useRef<any>(null);
    
    // Initialize PDF annotation handler
    useEffect(() => {
        if (view?.book?.type === 'pdf' && view.book.addPDFAnnotation) {
            // Create PDF annotation handler
            pdfAnnotationHandler.current = {
                book: view.book,
                currentPageIndex: 0
            };
        }
        
        return () => {
            if (pdfAnnotationHandler.current) {
                pdfAnnotationHandler.current = null;
            }
        };
    }, [view]);
    
    // Handle PDF text selection and create annotations
    const createPDFAnnotation = useCallback(async (selection: Selection, style: string, color: string, text: string, note: string = '') => {
        if (!pdfAnnotationHandler.current || !view?.book?.type === 'pdf') {
            return null;
        }
        
        try {
            // Get current page index
            const currentPageIndex = view.renderer?.currentIndex || 0;
            pdfAnnotationHandler.current.currentPageIndex = currentPageIndex;
            
            // Create PDF annotation using the book's method
            const annotation = view.book.addPDFAnnotation(currentPageIndex, {
                id: uniqueId(),
                type: 'annotation',
                style,
                color,
                text,
                note,
                pageIndex: currentPageIndex,
                createdAt: Date.now(),
                updatedAt: Date.now()
            });
            
            if (annotation) {
                // Save to book config
                const config = getConfig(bookKey);
                if (config) {
                    const { booknotes = [] } = config;
                    const pdfAnnotation: BookNote = {
                        id: annotation.id,
                        type: 'annotation',
                        cfi: `pdf_annotation_${annotation.id}`,
                        style,
                        color,
                        text,
                        note,
                        createdAt: annotation.createdAt,
                        updatedAt: annotation.updatedAt
                    };
                    
                    booknotes.push(pdfAnnotation);
                    const updatedConfig = { ...config, booknotes };
                    setConfig(bookKey, updatedConfig);
                    saveConfig(settings.envConfig, bookKey, updatedConfig, settings);
                }
                
                return annotation;
            }
        } catch (error) {
            console.error('Error creating PDF annotation:', error);
        }
        
        return null;
    }, [bookKey, view, getConfig, setConfig, saveConfig, settings]);
    
    // Remove PDF annotation
    const removePDFAnnotation = useCallback((annotationId: string) => {
        if (!pdfAnnotationHandler.current || !view?.book?.type === 'pdf') {
            return false;
        }
        
        try {
            // Remove from PDF book
            if (view.book.removePDFAnnotation) {
                view.book.removePDFAnnotation(annotationId);
            }
            
            // Remove from book config
            const config = getConfig(bookKey);
            if (config) {
                const { booknotes = [] } = config;
                const updatedBooknotes = booknotes.filter(note => note.id !== annotationId);
                const updatedConfig = { ...config, booknotes: updatedBooknotes };
                setConfig(bookKey, updatedConfig);
                saveConfig(settings.envConfig, bookKey, updatedConfig, settings);
            }
            
            return true;
        } catch (error) {
            console.error('Error removing PDF annotation:', error);
            return false;
        }
    }, [bookKey, view, getConfig, setConfig, saveConfig, settings]);
    
    // Update PDF annotation
    const updatePDFAnnotation = useCallback((annotationId: string, updates: Partial<BookNote>) => {
        if (!pdfAnnotationHandler.current || !view?.book?.type === 'pdf') {
            return false;
        }
        
        try {
            // Update in PDF book
            if (view.book.updatePDFAnnotation) {
                view.book.updatePDFAnnotation(annotationId, updates);
            }
            
            // Update in book config
            const config = getConfig(bookKey);
            if (config) {
                const { booknotes = [] } = config;
                const noteIndex = booknotes.findIndex(note => note.id === annotationId);
                if (noteIndex !== -1) {
                    booknotes[noteIndex] = {
                        ...booknotes[noteIndex],
                        ...updates,
                        updatedAt: Date.now()
                    };
                    const updatedConfig = { ...config, booknotes };
                    setConfig(bookKey, updatedConfig);
                    saveConfig(settings.envConfig, bookKey, updatedConfig, settings);
                }
            }
            
            return true;
        } catch (error) {
            console.error('Error updating PDF annotation:', error);
            return false;
        }
    }, [bookKey, view, getConfig, setConfig, saveConfig, settings]);
    
    // Get all PDF annotations for the book
    const getPDFAnnotations = useCallback(() => {
        if (!pdfAnnotationHandler.current || !view?.book?.type === 'pdf') {
            return [];
        }
        
        try {
            if (view.book.getPDFAnnotations) {
                const allAnnotations = [];
                for (let i = 0; i < view.book.sections.length; i++) {
                    const pageAnnotations = view.book.getPDFAnnotations(i);
                    allAnnotations.push(...pageAnnotations.map(ann => ({
                        ...ann,
                        pageIndex: i
                    })));
                }
                return allAnnotations;
            }
        } catch (error) {
            console.error('Error getting PDF annotations:', error);
        }
        
        return [];
    }, [view]);
    
    // Set current page for PDF annotations
    const setCurrentPDFPage = useCallback((pageIndex: number) => {
        if (pdfAnnotationHandler.current) {
            pdfAnnotationHandler.current.currentPageIndex = pageIndex;
        }
    }, []);
    
    return {
        createPDFAnnotation,
        removePDFAnnotation,
        updatePDFAnnotation,
        getPDFAnnotations,
        setCurrentPDFPage,
        isPDFBook: view?.book?.type === 'pdf'
    };
};
