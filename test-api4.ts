import OpenAI from "openai";
const openai = new OpenAI({ apiKey: 'invalid-key', baseURL: 'https://api.anthropic.com/v1' });
openai.models.list().then(console.log).catch(e => console.error("ERROR MESSAGE:", e.message));
