const multiPeriodTests = [
  {
    input: "Contract period: 04/08/2026 - 04/08/2027",
    expected: "04/08/2026 - 04/08/2027"
  },
  {
    input: "Billing period 04/08/2026 -> 04/08/2027",
    expected: "04/08/2026 - 04/08/2027"
  },
  {
    input: "OCR period: 4//8/2026 -> 4//8/2027",
    expected: "04/08/2026 - 04/08/2027"
  },
  {
    input: "Service: 08.04.2026 - 08.04.2027",
    expected: "08/04/2026 - 08/04/2027"
  },
  {
    input: "Subscription period 2026 - 2027",
    expected: "2026 - 2027"
  },
  {
    input: "Billing months: 08/2026 to 08/2027",
    expected: "08/2026 - 08/2027"
  },
  {
    input: "Coverage 2026-08-04 — 2027-08-04",
    expected: "04/08/2026 - 04/08/2027"
  },
  {
    input: "<p>Period: 04/08/2026 &rarr; 04/08/2027</p>",
    expected: "04/08/2026 - 04/08/2027"
  },
  {
    input: "Invoice Date: 04/08/2026 Due Date: 03/09/2026",
    expected: null
  },
  {
    input: "Invoice Date: 04/08/2026",
    expected: null
  },
  {
    input: "Period: 04/08/2026 - 04/08/2026",
    expected: null
  },
  {
    input: "Period: 04/08/2027 - 04/08/2026",
    expected: null
  },
  {
    input: "Invalid period: 32/13/2026 - 32/13/2027",
    expected: null
  },
  {
    input: "01/01/24 -> 31/12/24",
    expected: "01/01/2024 - 31/12/2024"
  },
  {
    input: "31-Mar-26 - 30-Mar-27",
    expected: "31/03/2026 - 30/03/2027"
  }
];

console.table(
  multiPeriodTests.map(test => {
    const actual = checkMultiPeriodInvoice(test.input);

    return {
      input: test.input,
      expected: test.expected,
      actual,
      passed: actual === test.expected
    };
  })
);