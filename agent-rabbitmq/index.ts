import * as dotenv from "dotenv";
import * as http from "http";
import * as amqp from "amqplib";
import OpenAI from "openai"; // 1. Import OpenAI

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 3000;
const OPEN_AI_KEY = process.env.OPENAI_API_KEY; 
const QUEUE_NAME = "hello";

// 2. Initialize OpenAI
const openai = new OpenAI({
  apiKey: OPEN_AI_KEY,
});

// 1. Establish RabbitMQ connection at startup
async function startRabbitMQ() {
  try {
    const connection = await amqp.connect("amqp://localhost");
    const channel = await connection.createChannel();

    await channel.assertQueue(QUEUE_NAME, {
      durable: true,
      arguments: {
        "x-queue-type": "quorum",
      },
    });

    // 2. Start the Receiver
    console.log(` [*] Waiting for messages in ${QUEUE_NAME}.`);
    
    // Note: Quorum queues require explicit acknowledgements for safety
    channel.consume(QUEUE_NAME, (msg) => {
      if (msg !== null) {
        console.log(` [x] Received: ${msg.content.toString()}`);
        channel.ack(msg); // Acknowledge message processing
      }
    });

    return channel;

  } catch (error) {
    console.error("RabbitMQ connection failed:", error);
    process.exit(1);
  }
}

// 3. Bootstrap the Server
async function bootstrap() {

  // Wait for RabbitMQ to connect before starting the HTTP server
  const channel = await startRabbitMQ();

  // Make the callback async to handle OpenAI promises
  const server = http.createServer(async (req, res) => {
    
    // 4. Sender: Trigger a message when visiting /send
    if (req.url === "/send") {
      const msg = `Hello World! Time: ${Date.now()}`;
      
      channel.sendToQueue(QUEUE_NAME, Buffer.from(msg));
      console.log(` [x] Sent %s`, msg);

      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(`Message sent to queue: ${msg}`);
      
    } 
    // 5. OpenAI Checker: Visit /check-ai to test your API key
    else if (req.url === "/check-ai") {
      try {
        console.log(" [~] Pinging OpenAI...");
        
        const response = await openai.chat.completions.create({
          model: "gpt-3.5-turbo", // You can change this to gpt-4o or gpt-4o-mini
          messages: [{ role: "user", content: "Say 'Your API key is working!'" }],
        });

        const reply = response.choices[0].message.content;
        console.log(` [x] OpenAI Reply: ${reply}`);

        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end(`OpenAI successfully replied:\n\n${reply}`);

      } catch (error) {
        console.error(" [!] OpenAI Error:", error.message);
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end(`Failed to connect to OpenAI. Error:\n\n${error.message}`);
      }
    } 
    // Fallback route
    else {
      res.writeHead(404);
      res.end("Not Found.\n\nTry visiting:\n- /send\n- /check-ai");
    }
  });

  server.listen(PORT, () => {
    console.log(`🚀 Server listening on port ${PORT}...`);
    console.log(`👉 Trigger a queue message: http://localhost:${PORT}/send`);
    console.log(`👉 Check OpenAI API Key:   http://localhost:${PORT}/check-ai`);
  });

}

bootstrap();