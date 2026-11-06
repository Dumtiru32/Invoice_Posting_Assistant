"use strict";

/**
 * Multi-period UI renderer.
 *
 * Requires detectMultiPeriod.js to be loaded first.
 */
(function exposeMultiPeriodUi(global) {
  const STATUS_ID = "multiPeriodInvoiceStatus";

  /**
   * Escapes dynamic content before inserting it into HTML.
   *
   * @param {unknown} value
   * @returns {string}
   */
  function escapeMultiPeriodHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  }

  /**
   * Returns the status badge HTML.
   *
   * This is the preferred integration for the current application because
   * script.js builds one output string before assigning it to #result.
   *
   * @param {string} invoiceText
   * @returns {string}
   */
  function buildMultiPeriodStatusHtml(invoiceText) {
    const detectedRange =
      typeof global.checkMultiPeriodInvoice === "function"
        ? global.checkMultiPeriodInvoice(invoiceText)
        : null;

    if (detectedRange) {
      return `
        <span
          id="${STATUS_ID}"
          class="multi-period-status multi-period-status--warning"
          role="status"
          aria-live="polite"
        >
          ⚠️ Checking if it is a multiperiod invoice:
          <strong>${escapeMultiPeriodHtml(detectedRange)}</strong>
        </span>
      `;
    }

    return `
      <span
        id="${STATUS_ID}"
        class="multi-period-status multi-period-status--success"
        role="status"
        aria-live="polite"
      >
        ✅ Multiperiod indication not found
      </span>
    `;
  }

  /**
   * Finds a text node containing the Due Date label.
   *
   * @param {HTMLElement} container
   * @returns {Text|null}
   */
  function findDueDateTextNode(container) {
    if (!container) {
      return null;
    }

    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const value = node.nodeValue?.replace(/\s+/g, " ").trim() || "";

          return /(?:⏳\s*)?Due\s+Date\s*:/i.test(value)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        }
      }
    );

    return walker.nextNode();
  }

  /**
   * Fallback DOM renderer.
   *
   * Locates the Due Date output and inserts or updates the badge.
   * It does not replace the Due Date element and does not modify form bindings.
   *
   * @param {string} invoiceText
   * @param {object} options
   * @param {string} options.resultContainerSelector
   * @returns {HTMLElement|null}
   */
  function renderMultiPeriodStatus(
    invoiceText = global.__lastPdfText || "",
    options = {}
  ) {
    const resultContainerSelector =
      options.resultContainerSelector || "#result";

    const resultContainer = document.querySelector(
      resultContainerSelector
    );

    if (!resultContainer) {
      console.warn(
        `Multi-period status not rendered: ${resultContainerSelector} was not found.`
      );
      return null;
    }

    const dueDateTextNode = findDueDateTextNode(resultContainer);

    if (!dueDateTextNode) {
      console.warn(
        "Multi-period status not rendered: Due Date output was not found."
      );
      return null;
    }

    const detectedRange =
      typeof global.checkMultiPeriodInvoice === "function"
        ? global.checkMultiPeriodInvoice(invoiceText)
        : null;

    let status = document.getElementById(STATUS_ID);

    if (!status) {
      status = document.createElement("span");
      status.id = STATUS_ID;
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");

      /*
       * Insert after the closest meaningful element where possible.
       * If Due Date is plain text in #result, append the badge without
       * replacing any existing node.
       */
      const dueDateElement = dueDateTextNode.parentElement;

      if (
        dueDateElement &&
        dueDateElement !== resultContainer &&
        dueDateElement.parentNode
      ) {
        dueDateElement.insertAdjacentElement("afterend", status);
      } else {
        resultContainer.appendChild(status);
      }
    }

    status.className = detectedRange
      ? "multi-period-status multi-period-status--warning"
      : "multi-period-status multi-period-status--success";

    status.replaceChildren();

    if (detectedRange) {
      status.append(
        document.createTextNode(
          "⚠️ Checking if it is a multiperiod invoice: "
        )
      );

      const strong = document.createElement("strong");
      strong.textContent = detectedRange;
      status.appendChild(strong);
    } else {
      status.textContent = "✅ Multiperiod indication not found";
    }

    return status;
  }

  global.buildMultiPeriodStatusHtml = buildMultiPeriodStatusHtml;
  global.renderMultiPeriodStatus = renderMultiPeriodStatus;
})(window);