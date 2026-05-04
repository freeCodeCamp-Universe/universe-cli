const output = document.querySelector("#output");
const button = document.querySelector("#ping-button");

button?.addEventListener("click", () => {
  if (output !== null) {
    output.textContent = "Universe static scaffold is alive.";
  }
});
