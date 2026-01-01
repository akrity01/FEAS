// ====================== CONFIG ======================
const API_BASE = "http://localhost:5000";   // your Node/Express server
const LOGIN_PATH = "login.html";            // if login.html is in /public with this page

document.addEventListener('DOMContentLoaded', function () {
  const foodForm = document.getElementById('foodForm');
  const foodTable = document.querySelector('#foodTable tbody');

  // Get user_id from localStorage (set during login)
  const user_id = localStorage.getItem('user_id');
  const userName = localStorage.getItem('user_name');

  // Require login
  if (!user_id) {
    alert('Please login first!');
    window.location.href = LOGIN_PATH;
    return;
  }

  // Welcome text + quick "Notify me now" button
  if (userName) {
    const h1 = document.querySelector('h1');
    if (h1 && !h1.textContent.includes(userName)) {
      h1.textContent += ` — Welcome, ${userName}!`;
    }
    addNotifyNowButton();
  }

  // Initial load
  loadItems();
  // expose so deleteItem (global) can refresh without full reload
  window.loadItems = loadItems;

  // ====================== ADD ITEM ======================
  foodForm.addEventListener('submit', function (e) {
    e.preventDefault();

    const itemData = {
      item_name: (document.getElementById('item_name').value || '').trim(),
      quantity: document.getElementById('quantity').value,
      purchase_date: document.getElementById('purchase_date').value,
      expiry_date: document.getElementById('expiry_date').value,
      category: (document.getElementById('category').value || '').trim(),
      user_id: user_id
    };

    // Validate dates
    if (new Date(itemData.expiry_date) < new Date(itemData.purchase_date)) {
      alert('Expiry date cannot be before purchase date!');
      return;
    }

    fetch(`${API_BASE}/add-item`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(itemData)
    })
      .then(r => r.json())
      .then(async data => {
        if (data.success) {
          alert(data.message || 'Item added successfully');
          foodForm.reset();
          setDefaultDates();
          await loadItems();

          // If this item expires in ≤ 2 days, trigger notify for this user
          if (isExpiringSoon(itemData.expiry_date)) {
            fetch(`${API_BASE}/notify/user/${user_id}`)
              .then(() => console.log('Notify triggered for expiring item'))
              .catch(err => console.warn('Notify trigger failed:', err));
          }
        } else {
          alert('Error: ' + (data.message || 'Unable to add item'));
        }
      })
      .catch(err => {
        console.error('Add item error:', err);
        alert('Error adding item');
      });
  });

  // ====================== LOAD ITEMS ======================
  function loadItems() {
    return fetch(`${API_BASE}/items/${user_id}`)
      .then(r => r.json())
      .then(data => {
        // Backend may return an array directly or {success, items}
        const items = Array.isArray(data) ? data : (data.items || []);
        displayItems(items);
      })
      .catch(err => {
        console.error('Load items error:', err);
      });
  }

  // ====================== RENDER TABLE ======================
  function displayItems(items) {
    foodTable.innerHTML = '';

    if (!items || items.length === 0) {
      foodTable.innerHTML =
        '<tr><td colspan="8" style="text-align:center;">No food items found</td></tr>';
      return;
    }

    items.forEach(item => {
      const row = document.createElement('tr');

      // Calculate status
      const status = getExpiryStatus(item.expiry_date);
      const statusClass =
        status === 'Expired' ? 'expired' :
        status === 'Expires Soon' ? 'expiring' : 'fresh';

      row.innerHTML = `
        <td>${item.id ?? item.item_id ?? '-'}</td>
        <td>${item.item_name}</td>
        <td>${item.quantity}</td>
        <td>${formatDate(item.purchase_date)}</td>
        <td>${formatDate(item.expiry_date)}</td>
        <td>${item.category || '-'}</td>
        <td class="status ${statusClass}">${status}</td>
        <td>
          <button class="delete-btn" data-id="${item.id ?? item.item_id}">Delete</button>
        </td>
      `;

      foodTable.appendChild(row);
    });

    // wire delete buttons
    foodTable.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        const id = this.getAttribute('data-id');
        deleteItem(id);
      });
    });
  }

  // ====================== STATUS & DATE HELPERS ======================
  function getExpiryStatus(expiryDate) {
    const today = new Date();
    const expiry = new Date(expiryDate);
    const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'Expired';
    if (diffDays <= 2) return 'Expires Soon';
    return 'Fresh';
  }

  function isExpiringSoon(expiryDate) {
    const today = new Date();
    const expiry = new Date(expiryDate);
    const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 2;
  }

  function formatDate(d) {
    if (!d) return '-';
    const date = new Date(d);
    if (isNaN(date.getTime())) return d; // show raw if not parsable
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  // ====================== DATE UX IMPROVEMENTS ======================
  const purchaseDateInput = document.getElementById('purchase_date');
  const expiryDateInput = document.getElementById('expiry_date');

  function setDefaultDates() {
    if (!purchaseDateInput.value) {
      const today = new Date().toISOString().split('T')[0];
      purchaseDateInput.value = today;
    }
    // min expiry = purchase
    expiryDateInput.min = purchaseDateInput.value;
  }
  setDefaultDates();

  purchaseDateInput.addEventListener('change', function () {
    expiryDateInput.min = this.value;
    if (expiryDateInput.value && expiryDateInput.value < this.value) {
      expiryDateInput.value = this.value;
    }
  });

  // Expose a manual notify button in header
  function addNotifyNowButton() {
    const header = document.querySelector('.right-actions') || document.querySelector('.header') || document.querySelector('h1') || document.body;
    const btn = document.createElement('button');
    btn.textContent = 'Notify me now';
    btn.style.marginLeft = '12px';
    btn.style.padding = '5px 10px';
    btn.style.backgroundColor = '#3498db';
    btn.style.color = 'white';
    btn.style.border = 'none';
    btn.style.borderRadius = '3px';
    btn.style.cursor = 'pointer';
    btn.addEventListener('click', async () => {
      try {
        const r = await fetch(`${API_BASE}/notify/user/${user_id}`);
        const t = await r.text();
        alert(t || 'Notification attempted. Check your WhatsApp/SMS.');
      } catch (e) {
        alert('Failed to trigger notification: ' + e.message);
      }
    });
    header.appendChild(btn);
  }
});

// ====================== DELETE ITEM (global) ======================
function deleteItem(itemId) {
  if (!confirm('Are you sure you want to delete this item?')) return;

  fetch(`${API_BASE}/items/${itemId}`, { method: 'DELETE' })
    .then(async r => {
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        // Show server-provided message if available
        throw new Error(data.message || `HTTP ${r.status}`);
      }
      if (data.success) {
        alert(data.message || 'Item deleted');
        // Re-render table without full page reload
        const tbody = document.querySelector('#foodTable tbody');
        if (tbody) {
          tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Refreshing...</td></tr>';
        }
        if (typeof window.loadItems === 'function') {
          window.loadItems();
        } else {
          location.reload(); // fallback
        }
      } else {
        throw new Error(data.message || 'Unable to delete');
      }
    })
    .catch(err => {
      console.error('Delete error:', err);
      alert('Error deleting item: ' + err.message);
    });
}

// ====================== LOGOUT ======================
function logout() {
  localStorage.removeItem('user_id');
  localStorage.removeItem('user_name');
  window.location.href = LOGIN_PATH;
}

// Add logout button dynamically (if your HTML doesn't already have one)
document.addEventListener('DOMContentLoaded', function () {
  const target = document.querySelector('.right-actions') || document.querySelector('h1');
  if (target) {
    const logoutBtn = document.createElement('button');
    logoutBtn.textContent = 'Logout';
    logoutBtn.style.marginLeft = '12px';
    logoutBtn.style.padding = '6px 10px';
    logoutBtn.style.backgroundColor = '#ff4444';
    logoutBtn.style.color = 'white';
    logoutBtn.style.border = 'none';
    logoutBtn.style.borderRadius = '6px';
    logoutBtn.style.cursor = 'pointer';
    logoutBtn.onclick = logout;
    target.appendChild(logoutBtn);
  }
});

// Background toggle: remember user's preference and toggle decorative images
// Category button removed — no handler required
