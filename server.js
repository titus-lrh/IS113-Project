
const express = require("express");
const server = express();
const userRoutes = require("./src/routes/userRoutes")
const recipeRoutes = require("./src/routes/recipeRoutes")
const commentRoutes = require("./src/routes/commentRoutes")

server.use(express.urlencoded({ extended: true }));

server.get("/", (req, res) => {
res.send("Success!")
})

server.use("/user", userRoutes)
server.use("/recipes", recipeRoutes)
server.use("/comment", commentRoutes)

const hostname = "localhost";
const port = 8000;

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});