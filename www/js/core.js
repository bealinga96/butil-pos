'use strict';
/* ===== Core: utilities, storage, allergen detection, seed data ===== */

const USERS = {
  'admin2026': { pass: 'myAdmin26*',  role: 'admin' },
  'Staff26':   { pass: 'myStaff2026*', role: 'staff' }
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n, l = 2) => String(n).padStart(l, '0');
const peso = n => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dKey = d => { d = new Date(d); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const fmtDT = iso => iso ? new Date(iso).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: '2-digit', hour: 'numeric', minute: '2-digit', hour12: true }) : '—';

/* ---------- Allergen detection (keyword based) ---------- */
const ALLERGEN_RULES = [
  ['Milk', /\b(milk|cream|butter|cheese|cheddar|parmesan|mozzarella|yogurt|yoghurt|whey|casein|latte|custard|creamer|condensed|evaporated|ghee|lactose)\b/],
  ['Eggs', /\b(egg|eggs|mayonnaise|mayo|meringue|albumen)\b/],
  ['Gluten (Wheat)', /\b(wheat|flour|bread|breadcrumbs|bun|buns|pasta|noodle|noodles|cake|biscuit|biscuits|cookie|cookies|croissant|pastry|dough|graham|cracker|crackers|barley|rye|oat|oats|malt|toast|waffle|pancake|tortilla|couscous)\b/],
  ['Soy', /\b(soy|soya|soybean|soybeans|tofu|tempeh|miso|edamame)\b/],
  ['Peanuts', /\b(peanut|peanuts|groundnut|groundnuts)\b/],
  ['Tree Nuts', /\b(almond|almonds|hazelnut|hazelnuts|walnut|walnuts|cashew|cashews|pecan|pecans|pistachio|pistachios|macadamia|macadamias|nut|nuts|nutella|praline)\b/],
  ['Fish', /\b(fish|tuna|salmon|anchovy|anchovies|cod|sardine|sardines|tilapia|bangus)\b/],
  ['Shellfish', /\b(shrimp|shrimps|prawn|prawns|crab|lobster|squid|clam|clams|mussel|mussels|oyster|oysters|scallop|scallops)\b/],
  ['Sesame', /\b(sesame|tahini)\b/],
  ['Mustard', /\bmustard\b/]
];
function detectAllergens(text) {
  const t = String(text || '').toLowerCase();
  const noMilk = t.replace(/\b(coconut|almond|soy|oat|rice) milk\b/g, ' ');
  const found = [];
  ALLERGEN_RULES.forEach(([name, rx]) => {
    if (rx.test(name === 'Milk' ? noMilk : t)) found.push(name);
  });
  return found;
}

/* ---------- EAN-13 barcode number ---------- */
function ean13(seq) {
  const base = '200' + String(seq).padStart(9, '0');
  let s = 0;
  for (let i = 0; i < 12; i++) s += (+base[i]) * (i % 2 ? 3 : 1);
  return base + ((10 - (s % 10)) % 10);
}

/* ---------- Seed data ---------- */
function seedData() {
  const cats = [['c-coffee', 'Coffee'], ['c-soda', 'Soda'], ['c-frappe', 'Frappe'], ['c-others', 'Others'],
                ['c-entree', 'Main Entree'], ['c-dessert', 'Dessert'], ['c-sides', 'Sides']].map(([id, name]) => ({ id, name }));
  const raw = [
    ['c-coffee', 'Americano', 90, 25, 50, 'Espresso shot, hot water'],
    ['c-coffee', 'Cafe Latte', 120, 40, 50, 'Espresso, steamed milk'],
    ['c-coffee', 'Caramel Macchiato', 140, 50, 50, 'Espresso, steamed milk, vanilla syrup, caramel drizzle'],
    ['c-coffee', 'Mocha', 135, 48, 50, 'Espresso, steamed milk, chocolate sauce, whipped cream'],
    ['c-soda', 'Lemon Soda', 85, 22, 40, 'Lemon juice, soda water, sugar syrup'],
    ['c-soda', 'Cola Float', 95, 30, 40, 'Cola, vanilla ice cream'],
    ['c-frappe', 'Java Chip Frappe', 160, 58, 40, 'Coffee, milk, ice, chocolate chips, whipped cream'],
    ['c-frappe', 'Matcha Frappe', 160, 60, 40, 'Matcha powder, milk, ice, sugar syrup, whipped cream'],
    ['c-frappe', 'Caramel Frappe', 155, 56, 40, 'Coffee, milk, ice, caramel sauce, whipped cream'],
    ['c-others', 'Hot Chocolate', 110, 35, 40, 'Cocoa, milk, sugar'],
    ['c-others', 'Iced Tea', 75, 15, 60, 'Black tea, lemon, sugar'],
    ['c-entree', 'Chicken Pesto Pasta', 220, 85, 25, 'Pasta, chicken breast, basil pesto, parmesan cheese, pine nuts, olive oil'],
    ['c-entree', 'Beef Tapa Rice Meal', 195, 80, 25, 'Beef tapa, garlic rice, fried egg, soy sauce, vinegar'],
    ['c-entree', 'Tuna Melt Sandwich', 180, 70, 25, 'Bread, tuna, mayonnaise, cheddar cheese'],
    ['c-dessert', 'Chocolate Lava Cake', 150, 55, 20, 'Flour, cocoa, butter, eggs, sugar, dark chocolate'],
    ['c-dessert', 'Cheesecake Slice', 140, 52, 20, 'Cream cheese, graham crackers, butter, eggs, sugar'],
    ['c-sides', 'French Fries', 90, 28, 40, 'Potato, vegetable oil, salt'],
    ['c-sides', 'Chicken Nuggets', 120, 45, 40, 'Chicken, flour, breadcrumbs, egg, vegetable oil']
  ];
  let n = 0;
  const products = raw.map(r => {
    n++;
    return { id: 'p' + n, sku: 'BUT-' + pad(n, 4), barcode: ean13(n), name: r[1], category: r[0],
             price: r[2], cost: r[3], stock: r[4], description: r[5], allergens: detectAllergens(r[5]) };
  });
  return { categories: cats, products, sales: [], sessions: [], counters: { product: n, receipt: 0 } };
}

/* ---------- Store (localStorage, fully offline) ---------- */
const Store = {
  key: 'butil_pos_v1',
  data: null,
  load() {
    try { this.data = JSON.parse(localStorage.getItem(this.key)); } catch (e) { this.data = null; }
    if (!this.data || !this.data.products) { this.data = seedData(); this.save(); }
  },
  save() {
    try { localStorage.setItem(this.key, JSON.stringify(this.data)); }
    catch (e) { alert('Storage error: could not save data. Free up device storage.'); }
  },
  uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
};
