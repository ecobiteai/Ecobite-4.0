/* ============================================================
   EcoBite — food catalogue

   Ten donation categories, each with its own list of food items
   for the "What is available?" dropdown. Every list ends with
   "Other — type it in" so nothing unusual is ever blocked.

   The category `key` values are the ones stored in
   food_offers.category — keep them in sync with the check
   constraint in ecobite-upgrade.sql.
   ============================================================ */

const FOOD_CATEGORIES = [
  {
    key: 'prepared', label: 'Prepared meals', emoji: '🍲',
    hint: 'Cooked and ready to eat — move these first.',
    items: [
      'Vegetable biryani', 'Chicken biryani', 'Plain rice', 'Jeera rice', 'Dal & rice',
      'Sambar & rice', 'Rasam & rice', 'Curd rice', 'Pulao', 'Fried rice',
      'Chapati / roti', 'Paratha', 'Poori & curry', 'Idli', 'Dosa',
      'Upma', 'Pongal', 'Khichdi', 'Pasta', 'Noodles',
      'Mixed vegetable curry', 'Paneer curry', 'Chicken curry', 'Egg curry', 'Fish curry',
      'Chole / rajma', 'Soup', 'Sandwiches', 'Wraps & rolls', 'Pizza',
      'Burgers', 'Salad bowls', 'Buffet leftovers (untouched)', 'Packed lunch boxes', 'Catering trays'
    ]
  },
  {
    key: 'produce', label: 'Fresh produce', emoji: '🥕',
    hint: 'Fruit and vegetables, loose or in crates.',
    items: [
      'Tomatoes', 'Onions', 'Potatoes', 'Carrots', 'Beetroot',
      'Cabbage', 'Cauliflower', 'Brinjal', 'Okra / bhindi', 'Beans',
      'Peas', 'Capsicum', 'Cucumber', 'Bottle gourd', 'Pumpkin',
      'Drumsticks', 'Spinach', 'Coriander & mint', 'Curry leaves', 'Green chillies',
      'Ginger & garlic', 'Bananas', 'Apples', 'Oranges', 'Mangoes',
      'Papaya', 'Watermelon', 'Grapes', 'Guava', 'Pineapple',
      'Pomegranate', 'Lemons', 'Mixed vegetable crate', 'Mixed fruit crate', 'Sprouts'
    ]
  },
  {
    key: 'bakery', label: 'Bakery', emoji: '🥐',
    hint: 'Baked today, best moved today.',
    items: [
      'Bread loaves', 'Brown bread', 'Pav / buns', 'Burger buns', 'Croissants',
      'Puffs', 'Samosas', 'Cookies & biscuits', 'Rusk', 'Muffins',
      'Cupcakes', 'Cake slices', 'Whole cake', 'Doughnuts', 'Pastries',
      'Pizza bases', 'Garlic bread', 'Bagels', 'Khari', 'Tea cake'
    ]
  },
  {
    key: 'chilled', label: 'Chilled & dairy', emoji: '🧊',
    hint: 'Needs an unbroken cold chain.',
    items: [
      'Milk', 'Curd / yoghurt', 'Buttermilk', 'Paneer', 'Cheese',
      'Butter', 'Ghee', 'Cream', 'Flavoured milk', 'Lassi',
      'Eggs', 'Cold cuts', 'Marinated meat', 'Fresh fish', 'Chicken',
      'Mutton', 'Chilled desserts', 'Sweet curd', 'Milk sweets', 'Tofu'
    ]
  },
  {
    key: 'frozen', label: 'Frozen', emoji: '❄️',
    hint: 'Keep it frozen until the moment of handover.',
    items: [
      'Frozen peas', 'Frozen mixed vegetables', 'Frozen corn', 'Frozen parathas', 'Frozen rotis',
      'Frozen samosas', 'Frozen nuggets', 'Frozen fries', 'Frozen fish', 'Frozen chicken',
      'Frozen prawns', 'Ice cream', 'Frozen desserts', 'Frozen dough', 'Frozen momos'
    ]
  },
  {
    key: 'dry', label: 'Dry goods & staples', emoji: '🌾',
    hint: 'Long shelf life — ideal for ration kits.',
    items: [
      'Rice', 'Wheat flour / atta', 'Maida', 'Rava / semolina', 'Toor dal',
      'Moong dal', 'Chana dal', 'Urad dal', 'Masoor dal', 'Rajma',
      'Chickpeas', 'Poha', 'Vermicelli', 'Pasta (dry)', 'Oats',
      'Sugar', 'Jaggery', 'Salt', 'Cooking oil', 'Spices & masala',
      'Tea', 'Coffee', 'Peanuts', 'Dry fruits', 'Ration kit (mixed)'
    ]
  },
  {
    key: 'beverages', label: 'Beverages', emoji: '🥤',
    hint: 'Sealed drinks only.',
    items: [
      'Drinking water bottles', 'Packaged juice', 'Fresh juice', 'Tender coconut', 'Soft drinks',
      'Buttermilk packs', 'Flavoured milk packs', 'Energy drinks', 'Tea / coffee (ready)', 'Soda',
      'Lemonade', 'Health drink powder', 'Syrups & concentrates'
    ]
  },
  {
    key: 'packaged', label: 'Packaged & canned', emoji: '🥫',
    hint: 'Sealed, labelled, within date.',
    items: [
      'Canned beans', 'Canned vegetables', 'Canned fruit', 'Tinned fish', 'Tomato puree',
      'Jam & spreads', 'Peanut butter', 'Honey', 'Sauces & ketchup', 'Pickles',
      'Ready-to-eat meals', 'Instant noodles', 'Soup packets', 'Breakfast cereal', 'Milk powder',
      'Baby cereal', 'Condensed milk', 'Papad'
    ]
  },
  {
    key: 'snacks', label: 'Snacks & sweets', emoji: '🍪',
    hint: 'Festival surplus, party trays, event boxes.',
    items: [
      'Namkeen / mixture', 'Chips', 'Murukku', 'Chakli', 'Sev',
      'Peanut chikki', 'Laddu', 'Barfi', 'Halwa', 'Gulab jamun',
      'Rasgulla', 'Jalebi', 'Kaju katli', 'Mysore pak', 'Chocolates',
      'Sweet boxes', 'Dry snacks (mixed)', 'Popcorn', 'Energy bars'
    ]
  },
  {
    key: 'special', label: 'Baby & special diet', emoji: '🍼',
    hint: 'Handle with extra care — check dates before flagging.',
    items: [
      'Infant formula', 'Baby food jars', 'Baby cereal', 'Weaning porridge', 'Diabetic-friendly food',
      'Gluten-free items', 'High-protein supplement', 'Nutrition drink', 'Sugar-free sweets', 'Low-sodium meals',
      'Jain / no-onion-garlic meals', 'Vegan meals', 'Soft / pureed meals for elders'
    ]
  }
];

const FOOD_UNITS = [
  'portions', 'plates', 'meal boxes', 'kg', 'grams',
  'litres', 'items', 'packets', 'crates', 'trays',
  'bags', 'boxes', 'bottles', 'cans', 'loaves', 'dozens'
];

const COLLECT_WINDOWS = [
  'Within 30 minutes', 'Within 1 hour', 'Within 2 hours', 'Within 3 hours',
  'This morning', 'This afternoon', 'This evening', 'Before closing time',
  'Tonight', 'Tomorrow morning', 'Tomorrow afternoon', 'Within 24 hours',
  'Choose a time later'
];

const FOOD_OTHER = '__other__';

const foodCategory = key => FOOD_CATEGORIES.find(category => category.key === key) || FOOD_CATEGORIES[0];

// The ten buttons at the top of the donate form.
const foodCategoryButtons = (selected = 'prepared') => FOOD_CATEGORIES.map(category =>
  `<button type="button" class="category-choice${category.key === selected ? ' on' : ''}" data-category="${category.key}" title="${category.hint}">
     <b aria-hidden="true">${category.emoji}</b><span>${category.label}</span>
   </button>`).join('');

// Refills a food <select> for the chosen category.
function fillFoodSelect(select, categoryKey, keepValue) {
  if (!select) return;
  const category = foodCategory(categoryKey);
  const previous = keepValue ? select.value : '';
  select.innerHTML =
    `<option value="">Select a food item…</option>` +
    category.items.map(item => `<option value="${item.replace(/"/g, '&quot;')}">${item}</option>`).join('') +
    `<option value="${FOOD_OTHER}">Other — type it in</option>`;
  if (previous && [...select.options].some(option => option.value === previous)) select.value = previous;
}

const foodUnitOptions = (selected = 'portions') =>
  FOOD_UNITS.map(unit => `<option value="${unit}"${unit === selected ? ' selected' : ''}>${unit}</option>`).join('');

const collectWindowOptions = (selected = 'Within 1 hour') =>
  COLLECT_WINDOWS.map(window => `<option value="${window}"${window === selected ? ' selected' : ''}>${window}</option>`).join('');

window.EcoFood = {
  FOOD_CATEGORIES, FOOD_UNITS, COLLECT_WINDOWS, FOOD_OTHER,
  foodCategory, foodCategoryButtons, fillFoodSelect, foodUnitOptions, collectWindowOptions
};
