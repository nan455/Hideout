const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express(); // ✅ you forgot this line
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public")); // serves index.html + CSS + JS

io.on("connection", (socket) => {
  console.log("A user connected");

  socket.on("chat message", (msg) => {
    io.emit("chat message", msg); // send to everyone
  });

  socket.on("disconnect", () => {
    console.log("A user disconnected");
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
