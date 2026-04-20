(function () {
  const joinView = document.getElementById("join-view");
  const loadingView = document.getElementById("loading-view");
  const errorView = document.getElementById("error-view");
  const joinForm = document.getElementById("join-form");
  const displayNameInput = document.getElementById("display-name");
  const hostNameSpan = document.getElementById("host-name");
  const loadingStatus = document.getElementById("loading-status");
  const errorMessage = document.getElementById("error-message");
  const retryBtn = document.getElementById("retry-btn");

  function showView(view) {
    joinView.classList.add("hidden");
    loadingView.classList.add("hidden");
    errorView.classList.add("hidden");
    view.classList.remove("hidden");
  }

  function showError(msg) {
    errorMessage.textContent = msg;
    showView(errorView);
  }

  async function loadConfig() {
    try {
      const resp = await fetch("/config");
      if (resp.ok) {
        const config = await resp.json();
        hostNameSpan.textContent = config.hostName || "a developer";
        document.title = `Fascinator - Join ${config.hostName}'s workspace`;
      }
    } catch {
      // use defaults
    }
  }

  async function pollReady(slotId, maxAttempts) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const resp = await fetch(`/api/slots/${slotId}/ready`);
        if (resp.ok) {
          const data = await resp.json();
          if (data.ready) return data.url;
        }
      } catch {
        // retry
      }
      loadingStatus.textContent = `Starting IDE... (${i + 1}s)`;
      await new Promise((r) => setTimeout(r, 1000));
    }
    return null;
  }

  joinForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const displayName = displayNameInput.value.trim();
    if (!displayName) return;

    showView(loadingView);
    loadingStatus.textContent = "Starting IDE...";

    try {
      const resp = await fetch("/api/slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        showError(text || "Failed to create workspace slot");
        return;
      }

      const slot = await resp.json();
      loadingStatus.textContent = "Waiting for IDE to start...";

      const url = await pollReady(slot.slotId, 90);
      if (url) {
        window.location.href = url;
      } else {
        showError("IDE took too long to start. Check /tmp/fascinator-setup.log in the terminal and try again.");
      }
    } catch (err) {
      showError(`Connection error: ${err.message}`);
    }
  });

  retryBtn.addEventListener("click", () => {
    showView(joinView);
    displayNameInput.focus();
  });

  loadConfig();
})();
