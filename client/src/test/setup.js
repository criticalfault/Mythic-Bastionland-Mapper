import '@testing-library/jest-dom';

// jsdom doesn't implement scrollIntoView — stub it so ChatPanel doesn't throw
window.HTMLElement.prototype.scrollIntoView = () => {};
