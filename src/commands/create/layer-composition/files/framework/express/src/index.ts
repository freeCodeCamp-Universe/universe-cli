import express from "express";

const app = express();

app.get("/", (_req, res) => {
  res.json({ name: "{{name}}", status: "ok" });
});

app.listen({{port}}, () => {
  console.log("Universe app running on http://localhost:{{port}}");
});
