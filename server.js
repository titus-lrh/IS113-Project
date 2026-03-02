
const express = require("express");
const server = express();

server.use(express.urlencoded({ extended: true }));

server.get("/", (req, res) => {
res.send("Success!")
})

const hostname = "localhost";
const port = 8000;

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});