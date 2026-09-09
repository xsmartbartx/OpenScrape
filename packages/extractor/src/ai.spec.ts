import { extractStructured } from './ai';

describe('AI structured extraction adapter', () => {
  it('sends server-side credentials and returns structured JSON with usage', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      model: 'test-model',
      choices: [{ message: { content: '{"title":"Example"}' } }],
      usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
    }), { status: 200 }));

    const result = await extractStructured<{ title: string }>('page text', 'Extract the title.', {
      endpoint: 'https://llm.example.com/v1',
      apiKey: 'server-secret',
      model: 'test-model',
      schemaName: 'page_result',
      schema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'], additionalProperties: false },
      fetch: fetchMock,
    });

    expect(result).toEqual({ data: { title: 'Example' }, model: 'test-model', usage: { promptTokens: 10, completionTokens: 4, totalTokens: 14 } });
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe('Bearer server-secret');
  });

  it('rejects oversized provider responses', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response('x'.repeat(100), { status: 200 }));
    await expect(extractStructured('page', 'instruction', {
      endpoint: 'https://llm.example.com/v1', apiKey: 'secret', model: 'model', schemaName: 'result', schema: {}, maxOutputBytes: 10, fetch: fetchMock,
    })).rejects.toThrow('exceeds the configured limit');
  });
});
