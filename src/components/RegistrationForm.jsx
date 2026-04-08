:root {
  font-family: system-ui, Avenir, Helvetica, Arial, sans-serif;
  line-height: 1.5;
  font-weight: 400;

  color-scheme: light dark;
  color: rgba(255, 255, 255, 0.87);
  background-color: #242424;

  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

a {
  font-weight: 500;
  color: #646cff;
  text-decoration: inherit;
}
a:hover {
  color: #535bf2;
}

/* UWAGA: body nie może mieć min-height ani display:flex — to nadpisuje layout PWA */
body {
  margin: 0;
  min-width: 320px;
}

h1 {
  font-size: 3.2em;
  line-height: 1.1;
}

button {
  border-radius: 8px;
  border: 1px solid transparent;
  padding: 0.6em 1.2em;
  font-size: 1em;
  font-weight: 500;
  font-family: inherit;
  background-color: #1a1a1a;
  cursor: pointer;
  transition: border-color 0.25s;
}
button:hover {
  border-color: #646cff;
}
button:focus,
button:focus-visible {
  outline: 4px auto -webkit-focus-ring-color;
}

@media (prefers-color-scheme: light) {
  :root {
    color: #213547;
    background-color: #ffffff;
  }
  a:hover {
    color: #747bff;
  }
  button {
    background-color: #f9f9f9;
  }
}

/* Responsive Form layout helpers */

/*
 * public-page-wrap — jedna klasa dla OBU stron publicznych (/rejestracja i /regulamin)
 *
 * Desktop (>768px):  karta wyśrodkowana, max-width 960px, widoczne tło po bokach
 * Mobile  (≤768px):  pełna szerokość, zero marginesów bocznych — jak natywna aplikacja
 *
 * Wcześniej były dwie osobne klasy (reg-wrap-inner / reg-wrap) które zachowywały się
 * odwrotnie: formularz był full-width na desktopie, regulamin miał marginesy na mobile.
 * Ujednolicenie eliminuje ten problem.
 */
.public-page-wrap {
  max-width: 1000px;
  margin: 0 auto;
  padding: 32px 24px 140px;
  box-sizing: border-box;
  width: 100%;
}

@media (max-width: 768px) {
  .public-page-wrap {
    /* Mobile: zero marginesów bocznych — karta rozciąga się na całą szerokość ekranu */
    padding: 0 0 100px;
    max-width: 100%;
  }
}

/* Zachowaj aliasy dla wstecznej kompatybilności (gdyby gdzieś indziej były używane) */
.reg-wrap-inner { max-width: 1000px; margin: 0 auto; padding: 32px 24px 140px; box-sizing: border-box; width: 100%; }
.reg-wrap       { max-width: 1000px; margin: 0 auto; box-sizing: border-box; width: 100%; }

@media (max-width: 768px) {
  .reg-wrap-inner { padding: 0 0 100px; max-width: 100%; }
  .reg-wrap       { padding-left: 0 !important; padding-right: 0 !important; max-width: 100%; }
}

.reg-grid-2 {
  display: grid;
  gap: 12px;
  grid-template-columns: 1fr 1fr;
}

@media (max-width: 768px) {
  .reg-grid-2 {
    grid-template-columns: 1fr;
  }
}

.reg-grid-2-1 {
  display: grid;
  gap: 12px;
  grid-template-columns: 2fr 1fr;
}

@media (max-width: 768px) {
  .reg-grid-2-1 {
    grid-template-columns: 1fr;
  }
}

.reg-grid-auto-200 {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
}

@media (max-width: 768px) {
  .reg-grid-auto-200 {
    grid-template-columns: 1fr;
  }
}

.reg-grid-participants {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
}

@media (max-width: 768px) {
  .reg-grid-participants {
    grid-template-columns: 1fr;
  }
}
