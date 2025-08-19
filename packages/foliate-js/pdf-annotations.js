import { storePDFAnnotation, getPDFAnnotations, removePDFAnnotation } from './pdf.js'

// PDF annotation handler that integrates with foliate-js
export class PDFAnnotationHandler {
    constructor(book) {
        this.book = book
        this.bookId = book.id
        this.currentPageIndex = 0
        this.selectionRanges = new Map() // pageIndex -> Range[]
        
        // Listen for PDF annotation clicks
        window.addEventListener('pdf-annotation-click', this.handleAnnotationClick.bind(this))
    }
    
    // Handle clicks on PDF annotations
    handleAnnotationClick = (event) => {
        const { annotation, pageIndex, bookId } = event.detail
        if (bookId === this.bookId) {
            // Emit event for the main app to handle
            window.dispatchEvent(new CustomEvent('show-annotation', {
                detail: {
                    value: `pdf_annotation_${annotation.id}`,
                    index: pageIndex,
                    annotation: annotation
                }
            }))
        }
    }
    
    // Get text selection coordinates for PDF highlighting
    getSelectionCoordinates(selection, viewport) {
        if (!selection || selection.rangeCount === 0) return null
        
        const range = selection.getRangeAt(0)
        const rects = Array.from(range.getClientRects())
        
        if (rects.length === 0) return null
        
        // Calculate bounding box for the selection
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        
        rects.forEach(rect => {
            minX = Math.min(minX, rect.left)
            minY = Math.min(minY, rect.top)
            maxX = Math.max(maxX, rect.right)
            maxY = Math.max(maxY, rect.bottom)
        })
        
        // Convert to PDF coordinates
        const scale = viewport.scale || 1
        return {
            x: minX / scale,
            y: minY / scale,
            width: (maxX - minX) / scale,
            height: (maxY - minY) / scale
        }
    }
    
    // Create PDF annotation from text selection
    createAnnotation(selection, style, color, text, note = '') {
        if (!selection || selection.rangeCount === 0) return null
        
        // Get current page viewport
        const currentPage = this.book.sections[this.currentPageIndex]
        if (!currentPage || !currentPage.viewport) return null
        
        const coordinates = this.getSelectionCoordinates(selection, currentPage.viewport)
        if (!coordinates) return null
        
        const annotation = {
            id: `pdf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'annotation',
            style: style,
            color: color,
            text: text,
            note: note,
            coordinates: coordinates,
            pageIndex: this.currentPageIndex,
            createdAt: Date.now(),
            updatedAt: Date.now()
        }
        
        // Store the annotation
        storePDFAnnotation(this.bookId, this.currentPageIndex, annotation)
        
        // Re-render the current page to show the highlight
        this.reapplyAnnotations(this.currentPageIndex)
        
        return annotation
    }
    
    // Remove PDF annotation
    removeAnnotation(annotationId) {
        if (removePDFAnnotation(this.bookId, annotationId)) {
            // Re-render all pages to update highlights
            for (let i = 0; i < this.book.sections.length; i++) {
                this.reapplyAnnotations(i)
            }
            return true
        }
        return false
    }
    
    // Update PDF annotation
    updateAnnotation(annotationId, updates) {
        const annotations = getPDFAnnotations(this.bookId, this.currentPageIndex)
        const annotationIndex = annotations.findIndex(a => a.id === annotationId)
        
        if (annotationIndex !== -1) {
            annotations[annotationIndex] = {
                ...annotations[annotationIndex],
                ...updates,
                updatedAt: Date.now()
            }
            
            // Re-render the page
            this.reapplyAnnotations(this.currentPageIndex)
            return true
        }
        return false
    }
    
    // Reapply annotations to a specific page
    reapplyAnnotations(pageIndex) {
        const page = this.book.sections[pageIndex]
        if (page && page.doc) {
            // Trigger re-render of annotations
            const event = new CustomEvent('pdf-reapply-annotations', {
                detail: { pageIndex, bookId: this.bookId }
            })
            window.dispatchEvent(event)
        }
    }
    
    // Set current page index
    setCurrentPage(pageIndex) {
        this.currentPageIndex = pageIndex
    }
    
    // Get all annotations for the current book
    getAllAnnotations() {
        const allAnnotations = []
        for (let i = 0; i < this.book.sections.length; i++) {
            const pageAnnotations = getPDFAnnotations(this.bookId, i)
            allAnnotations.push(...pageAnnotations.map(ann => ({
                ...ann,
                pageIndex: i
            })))
        }
        return allAnnotations
    }
    
    // Get annotations for a specific page
    getPageAnnotations(pageIndex) {
        return getPDFAnnotations(this.bookId, pageIndex)
    }
    
    // Clear all annotations for the book
    clearAllAnnotations() {
        for (let i = 0; i < this.book.sections.length; i++) {
            const annotations = getPDFAnnotations(this.bookId, i)
            annotations.forEach(ann => {
                removePDFAnnotation(this.bookId, ann.id)
            })
        }
        
        // Re-render all pages
        for (let i = 0; i < this.book.sections.length; i++) {
            this.reapplyAnnotations(i)
        }
    }
    
    // Destroy the handler
    destroy() {
        window.removeEventListener('pdf-annotation-click', this.handleAnnotationClick)
    }
}

// Export utility functions
export const createPDFAnnotation = (book, selection, style, color, text, note) => {
    const handler = new PDFAnnotationHandler(book)
    return handler.createAnnotation(selection, style, color, text, note)
}

export const removePDFAnnotationById = (book, annotationId) => {
    const handler = new PDFAnnotationHandler(book)
    return handler.removeAnnotation(annotationId)
}
