'use strict';
/* EAN-13 barcode rendered as inline SVG (works offline, scannable by hardware scanners) */
(function () {
  const L = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
  const G = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
  const R = ['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100'];
  const PAR = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];

  window.barcodeSVG = function (code) {
    code = String(code || '');
    if (!/^\d{13}$/.test(code)) return '';
    const par = PAR[+code[0]];
    let bits = '101';
    for (let i = 1; i <= 6; i++) bits += (par[i - 1] === 'L' ? L : G)[+code[i]];
    bits += '01010';
    for (let i = 7; i <= 12; i++) bits += R[+code[i]];
    bits += '101';
    let rects = '', i = 0;
    while (i < bits.length) {
      if (bits[i] === '1') {
        let j = i; while (j < bits.length && bits[j] === '1') j++;
        rects += '<rect x="' + (i + 4) + '" y="0" width="' + (j - i) + '" height="40"/>';
        i = j;
      } else i++;
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 103 40" preserveAspectRatio="none" fill="#18331f" aria-label="Barcode ' + code + '">' +
           '<rect x="0" y="0" width="103" height="40" fill="#fff"/>' + rects + '</svg>';
  };
})();
