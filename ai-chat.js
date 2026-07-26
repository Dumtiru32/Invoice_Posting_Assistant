// ai-chat.js
// Wires the floating AI button and the action-bar buttons to the chat panel
// that's already built into index.html / script.js.
//
// Load order matters: index.html loads script.js BEFORE this file, so
// callValidate() and appendUserMsg/appendBotMsg (declared with `function`
// at the top level of script.js) are already available on window here.

document.addEventListener("DOMContentLoaded", () => {
  const fab = document.getElementById("ap-ai-fab");
  const chat = document.getElementById("ap-ai-chat");
  const btnValidate = document.getElementById("ai-btn-validate");
  const btnRetour = document.getElementById("ai-btn-retour");

  // ---- Open the chat from the floating button ----
  fab?.addEventListener("click", () => {
    chat.hidden = false;
  });

  // ---- Validation button: run the AI check on the current invoice ----
  btnValidate?.addEventListener("click", () => {
    chat.hidden = false;

    if (typeof window.callValidate !== "function") {
      console.error("callValidate() not found — check that script.js loaded before ai-chat.js.");
      return;
    }

    appendUserMsg("Validate this invoice against the SOP.");
    window.callValidate();
  });

  // ---- Retour Invoice Email: deferred feature, stubbed for now ----
  btnRetour?.addEventListener("click", () => {
    chat.hidden = false;
    appendBotMsg(
      "<strong>🚧 Not available yet.</strong><br>" +
      "The Retour Invoice Email feature is on the roadmap — coming in a later phase."
    );
  });
});
