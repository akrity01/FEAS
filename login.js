// login.js

// ====================== CONFIG ======================
const API_BASE = "http://localhost:5000";
const DASHBOARD_PATH = "frontend.html";   // both pages in /public

// ====================== TOGGLE BETWEEN FORMS ======================
function toggleForm() {
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  if (loginForm) loginForm.classList.toggle("hidden");
  if (registerForm) registerForm.classList.toggle("hidden");

  // hide inline password help when switching
  const help = document.getElementById("passwordHelp");
  if (help) help.style.display = "none";
}

// ====================== COUNTRY CODE LIST ======================
const countryCodes = [
  { name: "India", code: "+91" },
  { name: "United States", code: "+1" },
  { name: "United Kingdom", code: "+44" },
  { name: "Canada", code: "+1" },
  { name: "Australia", code: "+61" },
  { name: "Germany", code: "+49" },
  { name: "France", code: "+33" },
  { name: "Italy", code: "+39" },
  { name: "Japan", code: "+81" },
  { name: "China", code: "+86" },
  { name: "Brazil", code: "+55" },
  { name: "South Africa", code: "+27" },
  { name: "Singapore", code: "+65" },
  { name: "United Arab Emirates", code: "+971" },
  { name: "Russia", code: "+7" },
  { name: "Mexico", code: "+52" },
  { name: "Spain", code: "+34" },
  { name: "New Zealand", code: "+64" },
  { name: "Nepal", code: "+977" },
  { name: "Bangladesh", code: "+880" },
];

// ====================== POPULATE COUNTRY DROPDOWNS ======================
function populateCountryCodes() {
  const selects = document.querySelectorAll(".countryCodeSelect");
  selects.forEach(select => {
    // keep previous selection if present
    const previous = select.value;
    select.innerHTML = "";
    countryCodes.forEach(c => {
      const option = document.createElement("option");
      option.value = c.code;
      option.textContent = `${c.name} (${c.code})`;
      if (c.code === "+91") option.selected = true; // default India
      select.appendChild(option);
    });
    if (previous) select.value = previous;
  });
}

// ====================== PASSWORD POLICY ======================
// same policy as server: at least 6 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{6,}$/;

// ====================== INLINE PASSWORD HELP UTIL ======================
function showInlinePasswordHelp(show = true) {
  const help = document.getElementById("passwordHelp");
  if (!help) return;
  help.style.display = show ? "block" : "none";
}

// ====================== helper for showing alerts (centralized) ======================
function showAlert(msg) {
  // existing app uses alert in many places — keep that consistent.
  alert(msg);
}

// ====================== REGISTER ======================
async function registerUser() {
  const nameInput = document.getElementById("regName");
  const countrySelect = document.getElementById("regCountryCode");
  const phoneInput = document.getElementById("regPhone");
  const passwordInput = document.getElementById("regPassword");

  const name = (nameInput?.value || "").trim();
  const countryCode = countrySelect?.value || "+91";
  const phone = (phoneInput?.value || "").trim();
  const password = (passwordInput?.value || "").trim();

  // Basic validations
  if (!name || !phone || !password) {
    showAlert("Please fill all fields!");
    return;
  }

  // phone digits validation
  if (!/^[0-9]{10}$/.test(phone)) {
    showAlert("📱 Please enter a valid 10-digit phone number (no country code).");
    return;
  }

  // password policy
  if (!PASSWORD_REGEX.test(password)) {
    // show inline help (if available) and focus password input
    showInlinePasswordHelp(true);
    if (passwordInput) passwordInput.focus();
    return;
  } else {
    showInlinePasswordHelp(false);
  }

  const fullPhone = `${countryCode}${phone}`;

  try {
    const response = await fetch(`${API_BASE}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone: fullPhone, password }),
    });

    // attempt parse
    const data = await response.json().catch(() => null);

    if (!data) {
      showAlert("Unexpected server response. Try again later.");
      return;
    }

    showAlert(data.message || (data.success ? "Registered" : "Registration failed"));

    if (data.success) {
      // pre-fill login with phone and switch to login form for convenience
      const loginCountry = document.getElementById("loginCountryCode");
      const loginPhone = document.getElementById("loginPhone");
      if (loginCountry) loginCountry.value = countryCode;
      if (loginPhone) loginPhone.value = phone;
      toggleForm();
    }
  } catch (error) {
    console.error("Registration error:", error);
    showAlert("Server error — please try again later.");
  }
}

// ====================== LOGIN ======================
async function loginUser() {
  const countrySelect = document.getElementById("loginCountryCode");
  const phoneInput = document.getElementById("loginPhone");
  const passwordInput = document.getElementById("loginPassword");

  const countryCode = countrySelect?.value || "+91";
  const phone = (phoneInput?.value || "").trim();
  const password = (passwordInput?.value || "").trim();

  if (!phone || !password) {
    showAlert("Please enter both phone number and password.");
    return;
  }

  if (!/^[0-9]{10}$/.test(phone)) {
    showAlert("📱 Please enter a valid 10-digit phone number (no country code).");
    return;
  }

  const fullPhone = `${countryCode}${phone}`;

  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: fullPhone, password }),
    });

    const data = await res.json().catch(() => null);

    if (!data) {
      showAlert("Unexpected server response.");
      return;
    }

    showAlert(data.message || (data.success ? "Login successful" : "Login failed"));

    if (data.success) {
      if (data.user_id && data.name) {
        localStorage.setItem("user_id", data.user_id.toString());
        localStorage.setItem("user_name", data.name);
        window.location.href = DASHBOARD_PATH;
      } else {
        console.error("Missing user data in response:", data);
        showAlert("Login failed: Missing user data from server.");
      }
    }
  } catch (error) {
    console.error("Login error:", error);
    showAlert("Server error — please try again later.");
  }
}

// ====================== LIVE PASSWORD FIELD BEHAVIOR ======================
function wirePasswordLiveBehavior() {
  const regPw = document.getElementById("regPassword");
  if (!regPw) return;

  // Hide inline help while user types; if they clear or it's invalid keep it hidden until submit
  regPw.addEventListener("input", () => {
    // If password already meets rules, hide help; otherwise keep hidden while typing
    if (PASSWORD_REGEX.test(regPw.value)) {
      showInlinePasswordHelp(false);
    }
    // If you want to show live feedback instead, uncomment the next line:
    // else showInlinePasswordHelp(true);
  });

  // Also show help when user leaves the password box if invalid (blur)
  regPw.addEventListener("blur", () => {
    if (!PASSWORD_REGEX.test(regPw.value) && regPw.value.length > 0) {
      showInlinePasswordHelp(true);
    }
  });
}

// ====================== Simple helpers: hook to buttons if present ======================
window.addEventListener("DOMContentLoaded", () => {
  populateCountryCodes();

  // hide password help initially
  showInlinePasswordHelp(false);

  // wire password live behavior
  wirePasswordLiveBehavior();

  const regBtn = document.getElementById("registerBtn");
  if (regBtn) regBtn.addEventListener("click", (e) => { e.preventDefault(); registerUser(); });

  const loginBtn = document.getElementById("loginBtn");
  if (loginBtn) loginBtn.addEventListener("click", (e) => { e.preventDefault(); loginUser(); });

  // toggle links/buttons (if present)
  const gotoRegister = document.getElementById("gotoRegister");
  if (gotoRegister) gotoRegister.addEventListener("click", (e) => { e.preventDefault(); toggleForm(); showInlinePasswordHelp(false); });

  const gotoLogin = document.getElementById("gotoLogin");
  if (gotoLogin) gotoLogin.addEventListener("click", (e) => { e.preventDefault(); toggleForm(); showInlinePasswordHelp(false); });
});

// Export functions for possible inline onclick handlers
window.registerUser = registerUser;
window.loginUser = loginUser;
window.toggleForm = toggleForm;
