/**
 * WhatsApp API Server
 * This server provides a REST API interface to interact with WhatsApp Web
 * using whatsapp-web.js library. It includes features for sending messages,
 * QR code authentication, and WebSocket status updates.
 */

const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const socketIo = require('socket.io');
const http = require('http');
const axios = require('axios');
const { TodoistApi } = require('@doist/todoist-api-typescript');
const fs = require('fs');
const path = require('path');
const rimraf = require('rimraf');
const { ElevenLabsClient } = require("elevenlabs");
const { Readable } = require("stream");

/**
 * Cleans up WhatsApp Web.js cache directories
 * This helps prevent authentication issues and ensures a fresh start
 */
function clearWWebJSCache() {
    const paths = [
        path.join(__dirname, '.wwebjs_auth'),
        path.join(__dirname, '.wwebjs_cache')
    ];

    paths.forEach(path => {
        if (fs.existsSync(path)) {
            rimraf.sync(path);
            console.log(`Deleted: ${path}`);
        }
    });
}

// Initialize cache cleanup
clearWWebJSCache();

// Setup cleanup on application exit
process.on('SIGINT', async () => {
    console.log('Cleaning up before exit...');
    clearWWebJSCache();
    process.exit(0);
});

// Express and Socket.IO setup
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));
app.use(express.json());

/**
 * WhatsApp client configuration
 * Uses local authentication strategy and headless browser
 */
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ],
    }
});

let isConnected = false;

/**
 * Socket.IO connection handler
 * Manages real-time communication for WhatsApp connection status
 */
io.on('connection', (socket) => {
    socket.on('checkState', () => {
        socket.emit('wa_state', {
            connected: client.info ? true : false
        });
    });
});

// Initialize WhatsApp client
client.initialize();

/**
 * WhatsApp Event Handlers
 */
client.on('qr', (qr) => {
    qrcode.toDataURL(qr, (err, url) => {
        io.emit('qr', url);
        io.emit('status', 'Please scan QR code');
    });
});

client.on('ready', () => {
    isConnected = true;
    io.emit('status', 'Conectado');
});

client.on('disconnected', () => {
    isConnected = false;
    io.emit('status', 'Desconectado');
});

/**
 * API Endpoints
 */

/**
 * Send WhatsApp message endpoint
 * @route POST /send-message
 * @param {string} number - Recipient's phone number
 * @param {string} message - Message content
 */
app.post('/send-message', async (req, res) => {
    if (!isConnected) return res.status(400).send('WhatsApp client not connected');

    const { number, message } = req.body;
    try {
        const chatId = number.includes('@c.us') ? number : `${number}@c.us`;
        await client.sendMessage(chatId, message);
        res.send('Message sent successfully');
    } catch (error) {
        res.status(500).send(error.message);
    }
});

/**
 * Send WhatsApp audio endpoint
 * @route POST /send-audio
 * @param {string} number - Recipient's phone number
 * @param {string} audioUrl - Audio file URL
 */
app.post('/send-audio', async (req, res) => {
    if (!isConnected) return res.status(400).send('WhatsApp client not connected');

    const { number, audioUrl } = req.body;
    try {
        const chatId = number.includes('@c.us') ? number : `${number}@c.us`;
        await client.sendMessage(chatId, {
            audio: { url: audioUrl },
            mimetype: 'audio/mp3'
        }, { sendAudioAsVoice: true });
        res.send('Audio sent successfully');
    } catch (error) {
        res.status(500).send(error.message);
    }
});

/**
 * Disconnect WhatsApp client endpoint
 * @route GET /disconnect
 */
app.get('/disconnect', async (req, res) => {
    try {
        await client.logout();
        res.send('WhatsApp client disconnected');
    } catch (error) {
        res.status(500).send(error.message);
    }
});

/**
 * Get daily message endpoint
 * @route GET /daily-message
 */
app.get('/daily-message', async (req, res) => {
    if (!isConnected) return res.status(400).send('WhatsApp client not connected');

    // Get today's date
    const today = new Date();
    const day = today.getDate();
    const month = today.getMonth() + 1;
    const year = today.getFullYear();

    const monthName = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][month - 1];
    const dayName = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'][today.getDay()];

    const el_api_key = 'sk_24c350ad4a62e5bc666debec1f31168382e3b0228cca9400';

    const number = '5218711908136';
    const DEEPSEEK_API_KEY = 'sk-1c546441c36b4646aa6fa0628901fa51'; // Reemplaza con tu API Key de DeepSeek
    const query = `
Eres un asistente virtual con un tono amigable y relajado, que utiliza jerga mexicana (como "wey", "que rollo", "esta perro", "vato" etc.) y un toque filosófico en tus respuestas. Tu objetivo es ayudarme a organizar mis tareas y motivarme al inicio del día diciendome buenos días.
Mi nombre es Martín y debes de darme los buenos días usando mi nombre y o diciendo we o vato, o joto, o algo así. Soy programador de apps moviles y me gusta escuchar musica.

    - Ejemplo de saludo: "Buenos días, wey. Recuerda que la vida es un absurdo existencial y que debemos encontrarle sentido a nuestras acciones. Animo joto. "

1. **Saludo Personalizado**:
   - Comienza con un saludo que incluya una frase filosófica estilo jean paul sartre o nietzche y jerga mexicana.
   - Recuerda que soy programador, así que puedes hacer referencia a eso.

2. **Lista de Tareas**:
   - Voy a proporcionarte una lista de tareas en formato JSON. Tu trabajo es enumerarlas de manera clara y organizada.
     - Ejemplo de formato JSON:
     json
     {
       "tareas": [
         {"titulo": "Revisar", "descripcion": "Revisar el código del módulo de autenticación"},
       ]
     }

   - Debes responder con algo como:
     Aquí tienes tus tareas, wey:
     1. Revisar el código del módulo de autenticación.
     2. Escribir pruebas unitarias para el nuevo feature.
     3. Reunión con el equipo a las 3 PM.
     Solo titulo y descripcion, el url no

3. **Mensaje Final**:
   - Termina con un mensaje motivador que combine filosofía y jerga mexicana.

4. **Formato de Respuesta**:
   - Tu respuesta debe tener tres partes claras:
     - Saludo personalizado.
     - Lista de tareas enumeradas.
     - Mensaje final motivador.
    Deben de estar separados por el simbolo && de línea para tomarlos de esta forma:
    saludo = respuesta_ia.split("&&")[0]
    tareas = respuesta_ia.split("&&")[1]
    mensaje_final = respuesta_ia.split("&&")[2]
`;

    try {
        const chatId = `${number}@c.us`;

        var api_key = '99ea149f82442c3b03cc9c34020c4404ac8f869f';
        const api = new TodoistApi(api_key);



        var response = await api.getTasks({
        });

        var tasks = response.results.map((task) => {
            return {
                content: task.content,
                description: task.description,
                isCompleted: task.isCompleted,
                labels: task.labels,
                url: task.url,
            }
        })

        // Obtener las noticias
        let data = JSON.stringify({
            "messages": [
                {
                    "content": "You are a helpful assistant llamado MartifuBot",
                    "role": "system"
                },
                {
                    "content": query + ' Estas son mis tareas: ' + JSON.stringify(tasks),
                    "role": "user"
                }
            ],
            "model": "deepseek-chat",
            "frequency_penalty": 0,
            "max_tokens": 2048,
            "presence_penalty": 0,
            "response_format": {
                "type": "text"
            },
            "stop": null,
            "stream": false,
            "stream_options": null,
            "temperature": 1,
            "top_p": 1,
            "tools": null,
            "tool_choice": "none",
            "logprobs": false,
            "top_logprobs": null
        });

        let config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: 'https://api.deepseek.com/chat/completions',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': 'Bearer ' + DEEPSEEK_API_KEY
            },
            data: data
        };

        var response = await axios(config);

        var message = response.data.choices[0].message.content;


        var saludo = message.split("&&")[0]
        var tareas = message.split("&&")[1]
        var mensaje_final = message.split("&&")[2]


        const clientEL = new ElevenLabsClient({ apiKey: el_api_key });
        const audio1 = await clientEL.textToSpeech.convert("uEtBdoxJywfMwzd5cfSv", {
            output_format: "mp3_44100_128",
            text: saludo,
            model_id: "eleven_multilingual_v2",
        });

        const audio2 = await clientEL.textToSpeech.convert("uEtBdoxJywfMwzd5cfSv", {
            output_format: "mp3_44100_128",
            text: mensaje_final,
            model_id: "eleven_multilingual_v2",
        });

        const audioBuffer1 = await streamToBuffer(audio1); // Convierte el flujo a Buffer
        const audioBase641 = audioBuffer1.toString('base64');

        const audioBuffer2 = await streamToBuffer(audio2); // Convierte el flujo a Buffer
        const audioBase642 = audioBuffer2.toString('base64');


        var media1 = await new MessageMedia('audio/mpeg', audioBase641, 'audio.mp3');
        //send saludo
        await client.sendMessage(chatId, media1, { sendAudioAsVoice: true });

        // sen tareas
        await client.sendMessage(chatId, tareas);

        var media2 = await new MessageMedia('audio/mpeg', audioBase642, 'audio.mp3');
        //send sound message final
        await client.sendMessage(chatId, media2, { sendAudioAsVoice: true });


        res.send('Daily message sent');
    } catch (error) {
        res.status(500).send(error.message);
    }
});

async function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.on("end", () => resolve(Buffer.concat(chunks)));
        stream.on("error", reject);
    });
}


/**
 * Index page endpoint
 * @route GET /
 */
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Add this line to serve static files
app.use(express.static('public'));

// Add server listening
server.listen(3000, '0.0.0.0', () => {
    console.log('Servidor corriendo en http://0.0.0.0:3000');
});