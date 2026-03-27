// index.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import twilio from 'twilio';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Load config
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const ULTRAVOX_API_KEY = process.env.ULTRAVOX_API_KEY;
const PORT = process.env.PORT || 5000;

// ---------------------------
// Helper: create Ultravox call
// ---------------------------
async function createUltravoxCall() {
    return new Promise((resolve, reject) => {
        const config = {
            systemPrompt: `You are a helpful AI assistant. If anyone asks who you are, say: "I am Rilwan's assistant."`,
            model: 'ultravox-v0.7',
            voice: 'Mark',
            temperature: 0.3,
            firstSpeakerSettings: { user: {} },
            medium: { twilio: {} }
        };

        const request = https.request('https://api.ultravox.ai/api/calls', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': ULTRAVOX_API_KEY
            }
        });

        let data = '';
        request.on('response', (res) => {
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (!json.joinUrl) reject(new Error('No joinUrl returned'));
                    else resolve(json);
                } catch (e) {
                    reject(new Error('Failed to parse Ultravox response: ' + data));
                }
            });
        });

        request.on('error', (err) => reject(err));
        request.write(JSON.stringify(config));
        request.end();
    });
}

// ---------------------------
// API Route: POST /call
// ---------------------------
app.post('/call', async (req, res) => {
    const { number } = req.body;

    if (!number || !number.startsWith('+')) {
        return res.status(400).json({ success: false, error: 'Number must include country code starting with +' });
    }

    try {
        const ultravox = await createUltravoxCall();
        const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

        const call = await client.calls.create({
            twiml: `<Response><Connect><Stream url="${ultravox.joinUrl}"/></Connect></Response>`,
            to: number,
            from: TWILIO_PHONE_NUMBER
        });

        res.json({ success: true, sid: call.sid });
    } catch (err) {
        console.error('Error during call:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ---------------------------
// Serve frontend (index.html)
// ---------------------------
app.use(express.static(path.join(__dirname)));

// Fallback route for SPA / any unknown path
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ---------------------------
// Start server
// ---------------------------
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});