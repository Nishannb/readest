import { describe, it, expect, vi, beforeEach } from 'vitest';
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

describe('/api/duckduckgo/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset fetch mock
    global.fetch = vi.fn();
  });

  it('should reject non-POST requests', async () => {
    const { req, res } = createMockReqRes('GET');

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      results: [],
      searchQuery: '',
      error: 'Method not allowed. Use POST.',
    });
  });

  it('should validate required query parameter', async () => {
    const { req, res } = createMockReqRes('POST', {});

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      results: [],
      searchQuery: '',
      error: 'Query parameter is required and must be a non-empty string',
    });
  });

  it('should validate query parameter type', async () => {
    const { req, res } = createMockReqRes('POST', { query: 123 });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      results: [],
      searchQuery: '',
      error: 'Query parameter is required and must be a non-empty string',
    });
  });

  it('should validate query parameter length', async () => {
    const { req, res } = createMockReqRes('POST', { query: 'a'.repeat(501) });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      results: [],
      searchQuery: '',
      error: 'Query parameter is too long (max 500 characters)',
    });
  });

  it('should validate prioritizeVideos parameter type', async () => {
    const { req, res } = createMockReqRes('POST', { query: 'test query', prioritizeVideos: 'true' });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      results: [],
      searchQuery: '',
      error: 'prioritizeVideos parameter must be a boolean',
    });
  });

  it('should handle valid request and return fallback results when API fails', async () => {
    // Mock fetch to simulate API failure
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const { req, res } = createMockReqRes('POST', { query: 'quantum computing' });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const jsonCall = (res.json as any).mock.calls[0][0];
    expect(jsonCall.success).toBe(false);
    expect(jsonCall.results).toHaveLength(4); // Fallback results
    expect(jsonCall.searchQuery).toBe('quantum computing');
    expect(jsonCall.error).toContain('Search');
    
    // Check fallback results structure
    expect(jsonCall.results[0]).toMatchObject({
      type: 'video',
      title: expect.stringContaining('YouTube'),
      url: expect.stringContaining('youtube.com'),
      source: 'youtube.com',
    });
  });

  it('should handle successful API response', async () => {
    // Mock successful DuckDuckGo API response
    const mockApiResponse = {
      AbstractText: 'Quantum computing is a type of computation that harnesses quantum mechanics.',
      AbstractURL: 'https://en.wikipedia.org/wiki/Quantum_computing',
      Heading: 'Quantum Computing',
      Image: 'https://example.com/quantum.jpg',
      RelatedTopics: [
        {
          FirstURL: 'https://www.youtube.com/watch?v=example',
          Text: 'Quantum Computing Explained - A comprehensive video tutorial',
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockApiResponse),
    });

    const { req, res } = createMockReqRes('POST', { query: 'quantum computing', prioritizeVideos: true });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const jsonCall = (res.json as any).mock.calls[0][0];
    expect(jsonCall.success).toBe(true);
    expect(jsonCall.results.length).toBeGreaterThan(0);
    expect(jsonCall.searchQuery).toBe('quantum computing');
    
    // Check that video results are prioritized
    const videoResults = jsonCall.results.filter((r: any) => r.type === 'video');
    if (videoResults.length > 0) {
      expect(jsonCall.results[0].type).toBe('video');
    }
  });

  it('should trim whitespace from query', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const { req, res } = createMockReqRes('POST', { query: '  quantum computing  ' });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const jsonCall = (res.json as any).mock.calls[0][0];
    expect(jsonCall.searchQuery).toBe('quantum computing');
  });

  it('should limit results to 10 items', async () => {
    // Mock API response with many results
    const mockApiResponse = {
      RelatedTopics: Array.from({ length: 20 }, (_, i) => ({
        FirstURL: `https://example.com/${i}`,
        Text: `Result ${i} - Description for result ${i}`,
      })),
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockApiResponse),
    });

    const { req, res } = createMockReqRes('POST', { query: 'test query' });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const jsonCall = (res.json as any).mock.calls[0][0];
    expect(jsonCall.results.length).toBeLessThanOrEqual(10);
  });
});