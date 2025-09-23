// Import required modules
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

// Initialize express and http server
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from "public" folder
app.use(express.static("public"));

// Handle socket connections
io.on("connection", (socket) => {
  console.log("✅ A user connected");

  // When someone sends a chat message
  socket.on("chat message", (msg) => {
    io.emit("chat message", msg); // broadcast to everyone
  });

  // When someone disconnects
  socket.on("disconnect", () => {
    console.log("❌ A user disconnected");
  });
});

// Railway provides PORT, fallback to 3000 for local use
const PORT = process.env.PORT || 3000;

// IMPORTANT: listen on "0.0.0.0" so Railway can expose it
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
