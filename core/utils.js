function getFormattedTimestamp() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return [
      now.getFullYear(),
      pad(now.getMonth() + 1),
      pad(now.getDate()),
      pad(now.getHours()),
      pad(now.getMinutes()),
      pad(now.getSeconds())
    ].join("_");
  }
  
  module.exports = {
    getFormattedTimestamp
  };