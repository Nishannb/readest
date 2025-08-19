import { describe, it, expect, vi } from 'vitest';
import handler from '../../pages/api/duckduckgo/search';
import type { NextApiRequest, NextApiResponse } from 'next';

// Mock the CORS middleware
vi.mock('@/utils/cors', () => ({
  corsAllMethods: vi.fn(),
  runMiddleware: vi.fn().mockResolvedValue(undefined),
}));

// Helper to create mock request/response objects
const createMockReqRes = (method: string = 'POST', body: any = {}) => {
  const req = {
    method,
    body,
  } as NextApiRequest;

  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    _statusCode: 200,
    _jsonData: null,
  } as unknown as NextApiResponse;

  // Mock the status and json methods to capture data
  (res.status as any).mockImplementation((code: number) => {
    (res as any)._statusCode = code;
    return res;
  });

  (res.json as any).mockImplementation((data: any) => {
    (res as any)._jsonData = data;
    return res;
  });

  return { req, res };
};

describe('/api/duckduckgo/search - Integration Tests', () => {
  it('should handle YouTube URL detection correctly', async () => {
    const mockApiResponse = {
      RelatedTopics: [
        {
          FirstURL: 'https://www.youtube.com/watch?v=abc123defgh',
          Text: 'Test Video - A great explanation video',
        },
        {
          FirstURL: 'https://youtu.be/def456hijkl',
          Text: 'Another Video - Short form YouTube link',
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockApiResponse),
    });

    const { req, res } = createMockReqRes('POST', { query: 'test videos' });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const jsonCall = (res.json as any).mock.calls[0][0];
    
    expect(jsonCall.success).toBe(true);
    expect(jsonCall.results).toHaveLength(2);
    
    // Check that both results are detected as videos
    expect(jsonCall.results[0].type).toBe('video');
    expect(jsonCall.results[1].type).toBe('video');
    
    // Check that YouTube thumbnails are generated
    expect(jsonCall.results[0].thumbnail).toBeDefined();
    expect(jsonCall.results[0].thumbnail).toContain('img.youtube.com');
    expect(jsonCall.results[1].thumbnail).toBeDefined();
    expect(jsonCall.results[1].thumbnail).toContain('img.youtube.com');
  });

  it('should handle article URL detection correctly', async () => {
    const mockApiResponse = {
      RelatedTopics: [
        {
          FirstURL: 'https://en.wikipedia.org/wiki/Test_Article',
          Text: 'Test Article - Wikipedia explanation',
        },
        {
          FirstURL: 'https://example.edu/research/paper',
          Text: 'Research Paper - Academic article',
        },
        {
          FirstURL: 'https://stackoverflow.com/questions/123',
          Text: 'Stack Overflow - Technical discussion',
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockApiResponse),
    });

    const { req, res } = createMockReqRes('POST', { query: 'test articles' });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const jsonCall = (res.json as any).mock.calls[0][0];
    
    expect(jsonCall.success).toBe(true);
    expect(jsonCall.results).toHaveLength(3);
    
    // Check that all results are detected as articles
    expect(jsonCall.results[0].type).toBe('article');
    expect(jsonCall.results[1].type).toBe('article');
    expect(jsonCall.results[2].type).toBe('article');
    
    // Check source extraction
    expect(jsonCall.results[0].source).toBe('en.wikipedia.org');
    expect(jsonCall.results[1].source).toBe('example.edu');
    expect(jsonCall.results[2].source).toBe('stackoverflow.com');
  });

  it('should prioritize videos when prioritizeVideos is true', async () => {
    const mockApiResponse = {
      RelatedTopics: [
        {
          FirstURL: 'https://en.wikipedia.org/wiki/Test',
          Text: 'Wikipedia Article - General information',
        },
        {
          FirstURL: 'https://www.youtube.com/watch?v=test123',
          Text: 'YouTube Video - Explanation video',
        },
        {
          FirstURL: 'https://example.com/blog',
          Text: 'Blog Post - Additional information',
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockApiResponse),
    });

    const { req, res } = createMockReqRes('POST', { 
      query: 'test content', 
      prioritizeVideos: true 
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const jsonCall = (res.json as any).mock.calls[0][0];
    
    expect(jsonCall.success).toBe(true);
    expect(jsonCall.results).toHaveLength(3);
    
    // Check that video result is first
    expect(jsonCall.results[0].type).toBe('video');
    expect(jsonCall.results[0].url).toContain('youtube.com');
  });

  it('should handle text cleaning and formatting correctly', async () => {
    const mockApiResponse = {
      RelatedTopics: [
        {
          FirstURL: 'https://example.com/test',
          Text: 'Test Title - This is a very long description that should be truncated properly and cleaned of any HTML tags like <b>bold</b> and <i>italic</i> text and also handle multiple    spaces    correctly',
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockApiResponse),
    });

    const { req, res } = createMockReqRes('POST', { query: 'test formatting' });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const jsonCall = (res.json as any).mock.calls[0][0];
    
    expect(jsonCall.success).toBe(true);
    expect(jsonCall.results).toHaveLength(1);
    
    const result = jsonCall.results[0];
    
    // Check title extraction
    expect(result.title).toBe('Test Title');
    
    // Check description cleaning
    expect(result.description).not.toContain('<b>');
    expect(result.description).not.toContain('<i>');
    expect(result.description).not.toContain('    '); // Multiple spaces should be normalized
    expect(result.description.length).toBeLessThanOrEqual(200); // Should be truncated
  });

  it('should handle Abstract and Definition results', async () => {
    const mockApiResponse = {
      AbstractText: 'This is an abstract explanation of the topic.',
      AbstractURL: 'https://en.wikipedia.org/wiki/Topic',
      Heading: 'Topic Heading',
      Image: 'https://example.com/image.jpg',
      Definition: 'This is a definition of the term.',
      DefinitionURL: 'https://dictionary.com/term',
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockApiResponse),
    });

    const { req, res } = createMockReqRes('POST', { query: 'test definition' });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const jsonCall = (res.json as any).mock.calls[0][0];
    
    expect(jsonCall.success).toBe(true);
    expect(jsonCall.results).toHaveLength(2);
    
    // Check abstract result
    const abstractResult = jsonCall.results.find((r: any) => r.title === 'Topic Heading');
    expect(abstractResult).toBeDefined();
    expect(abstractResult.description).toBe('This is an abstract explanation of the topic.');
    expect(abstractResult.url).toBe('https://en.wikipedia.org/wiki/Topic');
    expect(abstractResult.thumbnail).toBe('https://example.com/image.jpg');
    
    // Check definition result
    const definitionResult = jsonCall.results.find((r: any) => r.title === 'Definition');
    expect(definitionResult).toBeDefined();
    expect(definitionResult.description).toBe('This is a definition of the term.');
    expect(definitionResult.url).toBe('https://dictionary.com/term');
  });

  it('should limit results to 10 items maximum', async () => {
    const mockApiResponse = {
      RelatedTopics: Array.from({ length: 10 }, (_, i) => ({
        FirstURL: `https://example.com/related-${i}`,
        Text: `Related ${i} - Description for related result number ${i}`,
      })),
      Results: Array.from({ length: 8 }, (_, i) => ({
        FirstURL: `https://example.com/result-${i}`,
        Text: `Result ${i} - Description for result number ${i}`,
      })),
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockApiResponse),
    });

    const { req, res } = createMockReqRes('POST', { query: 'many results' });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const jsonCall = (res.json as any).mock.calls[0][0];
    
    expect(jsonCall.success).toBe(true);
    expect(jsonCall.results).toHaveLength(10); // Should be limited to 10 (8 RelatedTopics + 2 Results due to final limit)
  });

  it('should handle empty API response gracefully', async () => {
    const mockApiResponse = {}; // Empty response

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockApiResponse),
    });

    const { req, res } = createMockReqRes('POST', { query: 'empty response' });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const jsonCall = (res.json as any).mock.calls[0][0];
    
    expect(jsonCall.success).toBe(false); // Should be false because no results
    expect(jsonCall.results).toHaveLength(4); // Should return fallback results
    expect(jsonCall.error).toBe('Search service temporarily unavailable. Here are some manual search options.');
  });
});