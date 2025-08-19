const pdfjsPath = path => `/vendor/pdfjs/${path}`

import './vendor/pdfjs/pdf.mjs'
const pdfjsLib = globalThis.pdfjsLib
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsPath('pdf.worker.min.mjs')

const fetchText = async url => await (await fetch(url)).text()

let textLayerBuilderCSS = null
let annotationLayerBuilderCSS = null

// PDF-specific annotation storage
const pdfAnnotations = new Map() // bookId -> pageIndex -> annotations[]
const pdfAnnotationOverlays = new Map() // bookId -> pageIndex -> overlay elements

// Store PDF annotations with page-specific coordinates
export const storePDFAnnotation = (bookId, pageIndex, annotation) => {
    if (!pdfAnnotations.has(bookId)) {
        pdfAnnotations.set(bookId, new Map())
    }
    if (!pdfAnnotations.get(bookId).has(pageIndex)) {
        pdfAnnotations.get(bookId).set(pageIndex, [])
    }
    pdfAnnotations.get(bookId).get(pageIndex).push(annotation)
}

// Get PDF annotations for a specific page
export const getPDFAnnotations = (bookId, pageIndex) => {
    return pdfAnnotations.get(bookId)?.get(pageIndex) || []
}

// Remove PDF annotation
export const removePDFAnnotation = (bookId, annotationId) => {
    for (const [pageIndex, annotations] of pdfAnnotations.get(bookId) || []) {
        const index = annotations.findIndex(a => a.id === annotationId)
        if (index !== -1) {
            annotations.splice(index, 1)
            return true
        }
    }
    return false
}

// Create PDF annotation overlay
const createPDFAnnotationOverlay = (doc, pageIndex, bookId) => {
    const overlayContainer = document.createElement('div')
    overlayContainer.className = 'pdf-annotation-overlay'
    overlayContainer.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 10;
    `
    
    // Add click handler for annotation interaction
    overlayContainer.addEventListener('click', (e) => {
        const target = e.target
        if (target.classList.contains('pdf-highlight')) {
            const annotationId = target.dataset.annotationId
            const annotation = getPDFAnnotations(bookId, pageIndex)
                .find(a => a.id === annotationId)
            if (annotation) {
                // Emit event for annotation interaction
                window.dispatchEvent(new CustomEvent('pdf-annotation-click', {
                    detail: { annotation, pageIndex, bookId }
                }))
            }
        }
    })
    
    return overlayContainer
}

// Render PDF annotations on a page
const renderPDFAnnotations = async (doc, pageIndex, bookId, viewport) => {
    const annotations = getPDFAnnotations(bookId, pageIndex)
    if (annotations.length === 0) return
    
    let overlayContainer = doc.querySelector('.pdf-annotation-overlay')
    if (!overlayContainer) {
        overlayContainer = createPDFAnnotationOverlay(doc, pageIndex, bookId)
        doc.body.appendChild(overlayContainer)
    }
    
    // Clear existing highlights
    overlayContainer.innerHTML = ''
    
    // Render each annotation
    for (const annotation of annotations) {
        if (annotation.deletedAt) continue
        
        const highlightElement = document.createElement('div')
        highlightElement.className = 'pdf-highlight'
        highlightElement.dataset.annotationId = annotation.id
        
        // Convert PDF coordinates to viewport coordinates
        const { x, y, width, height } = annotation.coordinates
        const scale = viewport.scale || 1
        
        highlightElement.style.cssText = `
            position: absolute;
            left: ${x * scale}px;
            top: ${y * scale}px;
            width: ${width * scale}px;
            height: ${height * scale}px;
            background-color: ${annotation.color || 'rgba(255, 255, 0, 0.3)'};
            border-radius: 2px;
            pointer-events: auto;
            cursor: pointer;
        `
        
        overlayContainer.appendChild(highlightElement)
    }
}

const render = async (page, doc, zoom, bookId, pageIndex) => {
    const scale = zoom * devicePixelRatio
    doc.documentElement.style.transform = `scale(${1 / devicePixelRatio})`
    doc.documentElement.style.transformOrigin = 'top left'
    doc.documentElement.style.setProperty('--scale-factor', scale)
    const viewport = page.getViewport({ scale })

    // the canvas must be in the `PDFDocument`'s `ownerDocument`
    // (`globalThis.document` by default); that's where the fonts are loaded
    const canvas = document.createElement('canvas')
    canvas.height = viewport.height
    canvas.width = viewport.width
    const canvasContext = canvas.getContext('2d')
    await page.render({ canvasContext, viewport }).promise
    doc.querySelector('#canvas').replaceChildren(doc.adoptNode(canvas))

    const container = doc.querySelector('.textLayer')
    const textLayer = new pdfjsLib.TextLayer({
        textContentSource: await page.streamTextContent(),
        container, viewport,
    })
    await textLayer.render()

    // hide "offscreen" canvases appended to docuemnt when rendering text layer
    // https://github.com/mozilla/pdf.js/blob/642b9a5ae67ef642b9a8808fd9efd447e8c350e2/web/pdf_viewer.css#L51-L58
    for (const canvas of document.querySelectorAll('.hiddenCanvasElement'))
        Object.assign(canvas.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            width: '0',
            height: '0',
            display: 'none',
        })

    // fix text selection
    // https://github.com/mozilla/pdf.js/blob/642b9a5ae67ef642b9a8808fd9efd447e8c350e2/web/text_layer_builder.css#L105-L107
    const endOfContent = document.createElement('div')
    endOfContent.className = 'endOfContent'
    container.append(endOfContent)
    // TODO: this only works in Firefox; see https://github.com/mozilla/pdf.js/pull/17923
    container.onpointerdown = () => container.classList.add('selecting')
    container.onpointerup = () => container.classList.remove('selecting')

    const div = doc.querySelector('.annotationLayer')
    await new pdfjsLib.AnnotationLayer({ page, viewport, div }).render({
        annotations: await page.getAnnotations(),
        linkService: {
            goToDestination: () => {},
            getDestinationHash: dest => JSON.stringify(dest),
            addLinkAttributes: (link, url) => link.href = url,
        },
    })
    
    // Render user annotations after PDF native annotations
    if (bookId && pageIndex !== undefined) {
        await renderPDFAnnotations(doc, pageIndex, bookId, viewport)
    }
}

const renderPage = async (page, getImageBlob, bookId, pageIndex) => {
    const viewport = page.getViewport({ scale: 1 })
    if (getImageBlob) {
        const canvas = document.createElement('canvas')
        canvas.height = viewport.height
        canvas.width = viewport.width
        const canvasContext = canvas.getContext('2d')
        await page.render({ canvasContext, viewport }).promise
        return new Promise(resolve => canvas.toBlob(resolve))
    }
    // https://github.com/mozilla/pdf.js/blob/642b9a5ae67ef642b9a8808fd9efd447e8c350e2/web/pdf_viewer.css
    if (textLayerBuilderCSS == null) {
        textLayerBuilderCSS = await fetchText(pdfjsPath('text_layer_builder.css'))
    }
    // https://github.com/mozilla/pdf.js/blob/642b9a5ae67ef642b9a8808fd9efd447e8c350e2/web/annotation_layer_builder.css
    if (annotationLayerBuilderCSS == null) {
        annotationLayerBuilderCSS = await fetchText(pdfjsPath('annotation_layer_builder.css'))
    }
    const src = URL.createObjectURL(new Blob([`
        <!DOCTYPE html>
        <html lang="en">
        <meta charset="utf-8">
        <meta name="viewport" content="width=${viewport.width}, height=${viewport.height}">
        <style>
        html, body {
            margin: 0;
            padding: 0;
        }
        ${textLayerBuilderCSS}
        ${annotationLayerBuilderCSS}
        </style>
        <style>html,body{width:100%;height:100%;margin:0;padding:0;}</style>
        <div id="canvas"></div>
        <div class="textLayer"></div>
        <div class="annotationLayer"></div>
    `], { type: 'text/html' }))
    const onZoom = ({ doc, scale }) => render(page, doc, scale, bookId, pageIndex)
    return { src, onZoom }
}

const makeTOCItem = item => ({
    label: item.title,
    href: item.dest ? JSON.stringify(item.dest) : '',
    subitems: item.items.length ? item.items.map(makeTOCItem) : null,
})

export const makePDF = async file => {
    const bookId = `pdf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const transport = new pdfjsLib.PDFDataRangeTransport(file.size, [])
    transport.requestDataRange = (begin, end) => {
        file.slice(begin, end).arrayBuffer().then(chunk => {
            transport.onDataRange(begin, chunk)
        })
    }
    const pdf = await pdfjsLib.getDocument({
        range: transport,
        cMapUrl: pdfjsPath('cmaps/'),
        standardFontDataUrl: pdfjsPath('standard_fonts/'),
        isEvalSupported: false,
    }).promise

    const book = { 
        rendition: { layout: 'pre-paginated' },
        id: bookId,
        type: 'pdf'
    }

    const { metadata, info } = await pdf.getMetadata() ?? {}
    // TODO: for better results, parse `metadata.getRaw()`
    book.metadata = {
        title: metadata?.get('dc:title') ?? info?.Title,
        author: metadata?.get('dc:creator') ?? info?.Author,
        contributor: metadata?.get('dc:contributor'),
        description: metadata?.get('dc:description') ?? info?.Subject,
        language: metadata?.get('dc:language'),
        publisher: metadata?.get('dc:publisher'),
        subject: metadata?.get('dc:subject'),
        identifier: metadata?.get('dc:identifier'),
        source: metadata?.get('dc:source'),
        rights: metadata?.get('dc:rights'),
    }

    const outline = await pdf.getOutline()
    book.toc = outline?.map(makeTOCItem)

    const cache = new Map()
    book.sections = Array.from({ length: pdf.numPages }).map((_, i) => ({
        id: i,
        load: async () => {
            const cached = cache.get(i)
            if (cached) return cached
            const url = await renderPage(await pdf.getPage(i + 1), false, bookId, i)
            cache.set(i, url)
            return url
        },
        size: 1000,
    }))
    
    // PDF-specific methods for annotation handling
    book.addPDFAnnotation = (pageIndex, annotation) => {
        storePDFAnnotation(bookId, pageIndex, annotation)
        // Re-render the page if it's currently loaded
        const cached = cache.get(pageIndex)
        if (cached && cached.doc) {
            renderPDFAnnotations(cached.doc, pageIndex, bookId, cached.viewport)
        }
    }
    
    book.removePDFAnnotation = (annotationId) => {
        if (removePDFAnnotation(bookId, annotationId)) {
            // Re-render all pages to update highlights
            for (const [pageIndex, cached] of cache.entries()) {
                if (cached && cached.doc) {
                    renderPDFAnnotations(cached.doc, pageIndex, bookId, cached.viewport)
                }
            }
        }
    }
    
    book.getPDFAnnotations = (pageIndex) => {
        return getPDFAnnotations(bookId, pageIndex)
    }
    
    book.isExternal = uri => /^\w+:/i.test(uri)
    book.resolveHref = async href => {
        try {
            const parsed = JSON.parse(href)
            const dest = typeof parsed === 'string' ? await pdf.getDestination(parsed) : parsed
            if (!dest || !dest[0]) {
                try { window.dispatchEvent(new CustomEvent('foliate-go-to-failed', { detail: { stage: 'pdf-resolve', target: href, error: 'Missing destination' } })) } catch {}
                return null
            }
            const index = await pdf.getPageIndex(dest[0])
            return { index }
        } catch (e) {
            try { window.dispatchEvent(new CustomEvent('foliate-go-to-failed', { detail: { stage: 'pdf-resolve', target: href, error: e } })) } catch {}
            return null
        }
    }
    book.splitTOCHref = async href => {
        if (!href) return [null, null]
        const parsed = JSON.parse(href)
        const dest = typeof parsed === 'string'
            ? await pdf.getDestination(parsed) : parsed
        try {
            if (!dest || !dest[0]) throw new Error('Missing destination')
            const index = await pdf.getPageIndex(dest[0])
            return [index, null]
        } catch (e) {
            console.warn('Error getting page index for href', href)
            try { window.dispatchEvent(new CustomEvent('foliate-go-to-failed', { detail: { stage: 'pdf-toc', target: href, error: e } })) } catch {}
            return [null, null]
        }
    }
    book.getTOCFragment = doc => doc.documentElement
    book.getCover = async () => renderPage(await pdf.getPage(1), true, bookId, 0)
    book.destroy = () => {
        // Clean up annotations
        pdfAnnotations.delete(bookId)
        pdfAnnotationOverlays.delete(bookId)
        pdf.destroy()
    }
    return book
}
