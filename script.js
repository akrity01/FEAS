document.addEventListener('DOMContentLoaded', function() {
    const foodForm = document.getElementById('foodForm');
    const foodTable = document.querySelector('#foodTable tbody');
    // Get user_id from localStorage (set during login)
    const user_id = localStorage.getItem('user_id');
    const userName = localStorage.getItem('user_name');
    // Check if user is logged in
    if (!user_id) {
        alert('Please login first!');
        window.location.href = '/';
        return;
    }
    // Display welcome message
    if (userName) {
        const h1 = document.querySelector('h1');
        h1.textContent += ` - Welcome, ${userName}!`;
    }
    // Add logout button
    const header = document.querySelector('h1');
    const logoutBtn = document.createElement('button');
    logoutBtn.textContent = 'Logout';
    logoutBtn.style.marginLeft = '20px';
    logoutBtn.style.padding = '5px 10px';
    logoutBtn.style.backgroundColor = '#ff4444';
    logoutBtn.style.color = 'white';
    logoutBtn.style.border = 'none';
    logoutBtn.style.borderRadius = '3px';
    logoutBtn.style.cursor = 'pointer';
    logoutBtn.onclick = function() {
        localStorage.removeItem('user_id');
        localStorage.removeItem('user_name');
        window.location.href = '/';
    };
    header.appendChild(logoutBtn);
    // Load items when page loads
    loadItems();
    // Add new item
    foodForm.addEventListener('submit', function(e) {
        e.preventDefault();

        const itemData = {
            item_name: document.getElementById('item_name').value,
            quantity: document.getElementById('quantity').value,
            purchase_date: document.getElementById('purchase_date').value,
            expiry_date: document.getElementById('expiry_date').value,
            category: document.getElementById('category').value,
            user_id: user_id
        };
        // Validate dates
        if (new Date(itemData.expiry_date) < new Date(itemData.purchase_date)) {
            alert('Expiry date cannot be before purchase date!');
            return;
        }

        fetch('/add-item', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(itemData)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert(data.message);
                foodForm.reset();
                loadItems();
            } else {
                alert('Error: ' + data.message);
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('Error adding item');
        });
    });
    // Load all items for the user
    function loadItems() {
        fetch(`/items/${user_id}`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    displayItems(data.items);
                } else {
                    console.error('Error loading items:', data.message);
                }
            })
            .catch(error => {
                console.error('Error:', error);
            });
    }

    // Display items in table
    function displayItems(items) {
        foodTable.innerHTML = '';

        if (items.length === 0) {
            foodTable.innerHTML = '<tr><td colspan="8" style="text-align: center;">No food items found</td></tr>';
            return;
        }

        items.forEach(item => {
            const row = document.createElement('tr');
            
            // Calculate status
            const status = getExpiryStatus(item.expiry_date);
            const statusClass = status === 'Expired' ? 'expired' : 
                               status === 'Expires Soon' ? 'expiring' : 'fresh';

            row.innerHTML = `
                <td>${item.id}</td>
                <td>${item.item_name}</td>
                <td>${item.quantity}</td>
                <td>${formatDate(item.purchase_date)}</td>
                <td>${formatDate(item.expiry_date)}</td>
                <td>${item.category || '-'}</td>
                <td class="status ${statusClass}">${status}</td>
                <td>
                    <button onclick="deleteItem(${item.id})" class="delete-btn">Delete</button>
                </td>
            `;
            
            foodTable.appendChild(row);
        });
    }

    // Get expiry status
    function getExpiryStatus(expiryDate) {
        const today = new Date();
        const expiry = new Date(expiryDate);
        const diffTime = expiry - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            return 'Expired';
        } else if (diffDays <= 2) {
            return 'Expires Soon';
        } else {
            return 'Fresh';
        }
    }

    // Format date for display
    function formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    // Auto-set purchase date to today if empty
    const purchaseDateInput = document.getElementById('purchase_date');
    if (!purchaseDateInput.value) {
        const today = new Date().toISOString().split('T')[0];
        purchaseDateInput.value = today;
    }

    // Auto-set minimum expiry date to purchase date
    purchaseDateInput.addEventListener('change', function() {
        const expiryDateInput = document.getElementById('expiry_date');
        expiryDateInput.min = this.value;
        
        // If expiry date is before purchase date, reset it
        if (expiryDateInput.value && expiryDateInput.value < this.value) {
            expiryDateInput.value = this.value;
        }
    });

    // Set minimum expiry date on page load
    const expiryDateInput = document.getElementById('expiry_date');
    expiryDateInput.min = purchaseDateInput.value;
});

// Delete item function (needs to be global for onclick)
function deleteItem(itemId) {
    if (!confirm('Are you sure you want to delete this item?')) {
        return;
    }

    fetch(`/items/${itemId}`, {
        method: 'DELETE'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert(data.message);
            location.reload();
        } else {
            alert('Error: ' + data.message);
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Error deleting item');
    });
}