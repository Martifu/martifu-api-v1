const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const socketIo = require('socket.io');
const http = require('http');
const axios = require('axios');
const { TodoistApi } = require('@doist/todoist-api-typescript');


const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));
app.use(express.json());


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
        executablePath: '/usr/bin/brave-browser'
    }
});

let isConnected = false;


client.initialize();
// Eventos de WhatsApp
client.on('qr', (qr) => {
    qrcode.toDataURL(qr, (err, url) => {
        io.emit('qr', url);
        io.emit('status', 'Escane el QR');
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

// API Endpoints
app.post('/send-message', async (req, res) => {
    if (!isConnected) return res.status(400).send('No conectado');

    const { number, message } = req.body;
    try {
        const chatId = number.includes('@c.us') ? number : `${number}@c.us`;
        await client.sendMessage(chatId, message);
        res.send('Mensaje enviado');
    } catch (error) {
        res.status(500).send(error.message);
    }
});

app.post('/send-audio', async (req, res) => {
    if (!isConnected) return res.status(400).send('No conectado');

    const { number, audioUrl } = req.body;
    try {
        const chatId = number.includes('@c.us') ? number : `${number}@c.us`;
        await client.sendMessage(chatId, {
            audio: { url: audioUrl },
            mimetype: 'audio/mp3'
        }, { sendAudioAsVoice: true });
        res.send('Audio enviado');
    } catch (error) {
        res.status(500).send(error.message);
    }
});

app.get('/disconnect', async (req, res) => {
    try {
        await client.logout();
        res.send('Desconectado');
    } catch (error) {
        res.status(500).send(error.message);
    }
});

//DEEP SEEK
// Endpoint para obtener y enviar noticias de tecnología
app.get('/daily-message', async (req, res) => {
    if (!isConnected) return res.status(400).send('No conectado');

    //obtener el dia y mes en texto
    const today = new Date();
    const day = today.getDate();
    const month = today.getMonth() + 1;
    const year = today.getFullYear();

    const monthName = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][month - 1];
    const dayName = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'][today.getDay()];

    const number = '5218711908136';
    const DEEPSEEK_API_KEY = 'sk-1c546441c36b4646aa6fa0628901fa51'; // Reemplaza con tu API Key de DeepSeek
    const query = 'Hoy es ' + dayName + ' ' + day + ' de ' + monthName + ' del ' + year + ', Dame un mensaje mañanero  de buenos días como si fueras un coach de vida exigente, puedes ser ofensivo hablando en lenguaje informal, puedes decir grocerías, como si fueras un amigo en confianza. Mi nombre es Martín, dame una fraase al estilo Freud, Hegel, Jean Paul Sartre o Nietzsche.' +
        'Solo dame un saludo, y no quiero saber que estilo es. Usa palabras como Que onda we, Que rollo, y jerga mexicana, no uses las palabras Chido, carnal. Tiene que ser meidanamente corto. usa emojis, pero no tantos. Complementos: Soy programador deaplicaciones moviles, me gusta la tecnología y escuchar musica.' +
        ' Tambien me daras las tareas que tengo que hacer hoy mencionando la fecha antes de enlistarlas, con titulo y descripcion. te las mandare en formato json y en tu mensaje deben ser numero de tarea ej. 1., Titulo seguido de un salto de linea y la descripcion si es que tiene, no me devuelvas en formato JSON. Para agregar titulos en negritas el formato es un asterisco al inicio y uno al final solamente'

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

        // Enviar el mensaje
        await client.sendMessage(chatId, message);
        res.send('Noticias enviadas');
    } catch (error) {
        res.status(500).send(error.message);
    }
});

//get todoist tasks
app.get('/todoist', async (req, res) => {
    var api_key = '99ea149f82442c3b03cc9c34020c4404ac8f869f';
    const api = new TodoistApi(api_key);

    var response = await api.getTasks({
    });

    var tasks = response.data.results.map((task) => {
        return {
            content: task.content,
            description: task.description,
            isCompleted: task.isCompleted,
            labels: task.labels,
            url: task.url,
        }
    })

    res.send(tasks);


});


app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Add this line to serve static files
app.use(express.static('public'));

// Add server listening
server.listen(3000, '0.0.0.0', () => {
    console.log('Server running on http://localhost:3000');
});