/**
 * AuroMap Content Pipe - Content Script (v1.0.1)
 */

(function () {
  // Prevent duplicate injection
  if (window.hasOwnProperty("__auromap_injected")) return;
  window.__auromap_injected = true;

  console.log("[AuroMap CS] Content Script successfully injected on:", window.location.href);

  // 1. If we are on the receiver page (localhost:3000), set up listener ONLY (do not draw button)
  if (window.location.origin === "http://localhost:3000" || window.location.origin === "http://127.0.0.1:3000") {
    console.log("[AuroMap CS] Receiver page detected. Activating RELAY channel...");
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === "AUROMAP_RELAY_PAYLOAD") {
        console.log("[AuroMap CS] Payload received from background relay! Length:", message.payload?.length);
        
        // Dispatch CustomEvent to local React code
        window.dispatchEvent(new CustomEvent("auro-scrape-payload", {
          detail: message.payload
        }));
        
        sendResponse({ success: true });
      }
    });
    return; // Stop execution on localhost - no floating button needed here!
  }

  // 2. Otherwise (on chat/external pages), render the floating Scrape button
  function createScrapeButton() {
    // Check if button already exists
    if (document.querySelector(".auromap-scrape-btn")) return;

    const btn = document.createElement("button");
    btn.className = "auromap-scrape-btn";
    btn.title = "AuroMap: 抓取选中文字或最后一条 AI 回复";
    btn.innerHTML = `
      <svg viewBox="0 0 24 24">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
    `;

    document.body.appendChild(btn);

    btn.addEventListener("click", () => {
      scrapePayload(btn);
    });
  }

  // Smart selectors list for major AI platforms
  const SELECTORS = [
    // DeepSeek
    ".ds-markdown",
    "div.ds-markdown",
    // ChatGPT (Assistant Role)
    "div[data-message-author-role='assistant']",
    "div[data-message-author-role='assistant'] .markdown",
    // Claude AI (Assistant messages)
    ".font-claude-message",
    "div.prose.font-claude-message",
    ".font-normal.text-slate-900.prose",
    // Common markdown containers
    ".markdown",
    ".prose",
    ".message-content",
    ".chat-message-assistant",
    // Fallback - generic bubbles
    "div[class*='assistant']",
    "div[class*='message-content']"
  ];

  function scrapePayload(btn) {
    console.log("[AuroMap CS] Scrape button clicked. Initiating text capture...");

    let scrapedText = "";

    // PRIORITY 1: User Text Highlight / Selection (Bulletproof general-purpose capture!)
    const selection = window.getSelection().toString().trim();
    if (selection.length > 0) {
      console.log("[AuroMap CS] Capturing user text selection highlight.");
      scrapedText = selection;
    } 
    // PRIORITY 2: Smart DOM Selector (Auto-selects last AI response bubble)
    else {
      console.log("[AuroMap CS] No active selection. Running smart DOM selector...");
      let targetElement = null;

      for (const selector of SELECTORS) {
        const elements = document.querySelectorAll(selector);
        if (elements && elements.length > 0) {
          targetElement = elements[elements.length - 1]; // take the latest response bubble
          console.log(`[AuroMap CS] Matched selector: "${selector}"`);
          break;
        }
      }

      // Fallback: Wider div scan
      if (!targetElement) {
        const divs = document.querySelectorAll("div");
        for (let i = divs.length - 1; i >= 0; i--) {
          const div = divs[i];
          if (div.innerText && div.innerText.length > 150 && (div.classList.contains("markdown") || div.classList.contains("prose"))) {
            targetElement = div;
            console.log("[AuroMap CS] Matched generic prose div fallback");
            break;
          }
        }
      }

      if (targetElement) {
        scrapedText = targetElement.innerText || targetElement.textContent || "";
      }
    }

    // Validation
    if (!scrapedText || scrapedText.trim().length === 0) {
      console.warn("[AuroMap CS] No text captured. Please select some text or wait for AI to reply.");
      triggerShakeAnimation(btn);
      return;
    }

    console.log("[AuroMap CS] Text captured. Sending payload of length:", scrapedText.length);

    // 3. Relay to background service worker
    chrome.runtime.sendMessage({
      type: "AUROMAP_SCRAPE_PAYLOAD",
      payload: scrapedText
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("[AuroMap CS] Relay message failed:", chrome.runtime.lastError.message);
        alert("AuroMap 旁路管道连接失败！请确认您已经刷新了当前页面以及 localhost:3000 页面。");
        triggerShakeAnimation(btn);
        return;
      }
      
      if (response && response.success) {
        console.log("[AuroMap CS] Payload successfully relayed to local web app!");
        // Success pulse animation
        btn.classList.add("success");
        setTimeout(() => {
          btn.classList.remove("success");
        }, 1200);
      } else {
        console.warn("[AuroMap CS] Relay unsuccessful:", response?.reason || "unknown error");
        alert("AuroMap 网页端 (localhost:3000) 尚未打开，请先打开网页端！");
        triggerShakeAnimation(btn);
      }
    });
  }

  function triggerShakeAnimation(btn) {
    btn.style.animation = "none";
    setTimeout(() => { 
      btn.style.animation = "shake 0.3s cubic-bezier(.36,.07,.19,.97) both"; 
    }, 10);
  }

  // Inject CSS for animations
  const style = document.createElement("style");
  style.innerHTML = `
    @keyframes shake {
      10%, 90% { transform: translate3d(-1px, 0, 0); }
      20%, 80% { transform: translate3d(2px, 0, 0); }
      30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
      40%, 60% { transform: translate3d(4px, 0, 0); }
    }
  `;
  document.head.appendChild(style);

  // Initialize
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createScrapeButton);
  } else {
    createScrapeButton();
  }
})();
