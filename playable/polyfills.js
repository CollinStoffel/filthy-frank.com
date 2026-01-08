// polyfills.js
// Keep tiny helpers out of game.js to stay under the 1000-line rule.

(() => {
  // Polyfill for roundRect (older browsers)
  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      const rr = typeof r === "number" ? { tl: r, tr: r, br: r, bl: r } : r;
      this.beginPath();
      this.moveTo(x + rr.tl, y);
      this.lineTo(x + w - rr.tr, y);
      this.quadraticCurveTo(x + w, y, x + w, y + rr.tr);
      this.lineTo(x + w, y + h - rr.br);
      this.quadraticCurveTo(x + w, y + h, x + w - rr.br, y + h);
      this.lineTo(x + rr.bl, y + h);
      this.quadraticCurveTo(x, y + h, x, y + h - rr.bl);
      this.lineTo(x, y + rr.tl);
      this.quadraticCurveTo(x, y, x + rr.tl, y);
      return this;
    };
  }
})();


