if (!Uint8Array.prototype.toHex) {
  Uint8Array.prototype.toHex = function () {
    let hex = "";
    for (let i = 0; i < this.length; i++) {
      hex += this[i].toString(16).padStart(2, "0");
    }
    return hex;
  };
}

if (!Uint8Array.prototype.setFromHex) {
  Uint8Array.prototype.setFromHex = function (hex) {
    if (this.length !== hex.length / 2) {
      throw new Error(`setFromHex: expected ${this.length} bytes, got ${hex.length / 2}`);
    }
    for (let i = 0; i < this.length; i++) {
      this[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return this;
  };
}