const express = require('express');
const WebSocket = require('ws');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Enable JSON body parsing & serve static files
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
// Also serve root directory if accessed
app.use('/root', express.static(path.join(__dirname, '..')));

// Serial port configuration
let serialPort = null;
let parser = null;
let wsClients = [];
let currentPort = null;

// Initialize serial port
function initSerial(portName = 'COM3') {
  try {
    if (serialPort) {
      if (serialPort.isOpen) {
        serialPort.close((err) => {
          if (err) console.error('Error closing port:', err.message);
          openPort(portName);
        });
        return;
      }
    }
    openPort(portName);
  } catch (err) {
    console.error('Failed to initialize serial port:', err.message);
  }
}

function openPort(portName) {
  try {
    console.log(`Attempting to open serial port ${portName}...`);
    currentPort = portName;
    serialPort = new SerialPort({
      path: portName,
      baudRate: 115200,
      autoOpen: true
    });

    parser = serialPort.pipe(new ReadlineParser({ delimiter: '\r\n' }));

    parser.on('data', (line) => {
      const message = line.toString().trim();
      if (message) {
        // Forward complete line to all WebSocket clients
        broadcastToClients(message);
      }
    });

    serialPort.on('open', () => {
      console.log(`✓ Serial port ${portName} opened successfully at 115200 baud`);
      broadcastToClients(`SYSTEM:Port ${portName} connected`);
    });

    serialPort.on('error', (err) => {
      console.error(`Serial port (${portName}) error:`, err.message);
    });

    serialPort.on('close', () => {
      console.log(`Serial port ${portName} closed.`);
    });
  } catch (err) {
    console.error(`Failed to open serial port ${portName}:`, err.message);
  }
}

// Broadcast serial data to all connected web clients
function broadcastToClients(message) {
  wsClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('Web client connected via WebSocket');
  wsClients.push(ws);

  // Send connection confirmation
  ws.send('CONNECTED:Server');
  if (serialPort && serialPort.isOpen) {
    ws.send(`SYSTEM:Connected to ${currentPort}`);
  }

  ws.on('message', (data) => {
    const msg = data.toString();
    console.log('Web message received:', msg);
    // Forward command to ESP32 over serial if open
    if (serialPort && serialPort.isOpen) {
      serialPort.write(msg + '\n');
    }
  });

  ws.on('close', () => {
    console.log('Web client disconnected');
    wsClients = wsClients.filter((client) => client !== ws);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });
});

// API endpoint to list available serial ports
app.get('/api/ports', async (req, res) => {
  try {
    const ports = await SerialPort.list();
    res.json(ports);
  } catch (err) {
    console.error('Error listing ports:', err);
    res.json([]);
  }
});

// API endpoint to connect to serial port
app.post('/api/connect/:port', (req, res) => {
  const port = req.params.port;
  initSerial(port);
  res.json({ status: 'connecting', port });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  console.log(`🚀 ESP32 Dashboard Server running at http://localhost:${PORT}`);
  console.log(`📡 WebSocket stream on ws://localhost:${PORT}`);
  
  // Auto-detect available COM ports or try COM3
  try {
    const ports = await SerialPort.list();
    if (ports && ports.length > 0) {
      const targetPort = ports.find(p => p.manufacturer && (p.manufacturer.includes('Silicon Labs') || p.manufacturer.includes('CH340') || p.manufacturer.includes('FTDI') || p.manufacturer.includes('Espressif'))) || ports[0];
      console.log(`Found serial port: ${targetPort.path} (${targetPort.manufacturer || 'Standard Serial'})`);
      initSerial(targetPort.path);
    } else {
      console.log('No active serial ports detected. Standing by for connection or simulated telemetry.');
    }
  } catch (err) {
    initSerial('COM3');
  }
});

