import { OpenScrapeApiError, OpenScrapeClient } from './index';

describe('OpenScrapeClient', () => {
  it('sends workspace requests with the configured bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response(JSON.stringify([{ id: 'robot-1' }]), { status: 200 }));
    const client = new OpenScrapeClient({ baseUrl: 'https://api.example.com/api/v1', token: 'session-token', fetch: fetchMock });

    await client.listRobots();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/robots',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer session-token' }) }),
    );
  });

  it('maps API errors into OpenScrapeApiError', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Quota exceeded' }), { status: 429 }));
    const client = new OpenScrapeClient({ baseUrl: 'https://api.example.com/api/v1', apiKey: 'secret', fetch: fetchMock });

    await expect(client.getUsage()).rejects.toEqual(new OpenScrapeApiError(429, 'Quota exceeded'));
  });
});
