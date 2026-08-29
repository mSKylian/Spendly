import OpenAI from "openai";
const openai = new OpenAI({ apiKey: 'invalid-key', baseURL: 'https://google.com' });
openai.models.list().then(console.log).catch(e => console.error("ERROR MESSAGE:", e.message));
