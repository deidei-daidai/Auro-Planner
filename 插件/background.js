/**
 * AuroMap Content Pipe - Background Service Worker
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "AUROMAP_SCRAPE_PAYLOAD") {
    console.log("[AuroMap BG] Received scrape payload of length:", message.payload.length);

    // Query all open tabs to find localhost:3000 (AuroMap Planner Web Portal)
    chrome.tabs.query({}, (tabs) => {
      let targetTabs = tabs.filter(tab => 
        tab.url && (tab.url.startsWith("http://localhost:3000") || tab.url.startsWith("http://127.0.0.1:3000"))
      );

      if (targetTabs.length === 0) {
        console.warn("[AuroMap BG] AuroMap Web Portal (localhost:3000) is not open.");
        sendResponse({ success: false, reason: "AuroMap Web Portal is not open on localhost:3000" });
        return;
      }

      console.log(`[AuroMap BG] Found ${targetTabs.length} target tab(s). Sending payload...`);
      
      let pendingMessages = targetTabs.map(tab => {
        return new Promise((resolve) => {
          chrome.tabs.sendMessage(tab.id, {
            type: "AUROMAP_RELAY_PAYLOAD",
            payload: message.payload
          }, (response) => {
            if (chrome.runtime.lastError) {
              console.warn(`[AuroMap BG] Failed to send to tab ${tab.id}:`, chrome.runtime.lastError.message);
              resolve(false);
            } else {
              resolve(response && response.success);
            }
          });
        });
      });

      Promise.all(pendingMessages).then((results) => {
        let successCount = results.filter(Boolean).length;
        console.log(`[AuroMap BG] Successfully relayed payload to ${successCount} tab(s).`);
        sendResponse({ success: successCount > 0 });
      });
    });

    // Return true to indicate asynchronous response
    return true;
  }
});
