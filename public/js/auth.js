// Login / signup for login.html
import { supabase, setMessage, friendlyError, homeFor, loadProfile } from "./common.js";

const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");
const tabLogin = document.getElementById("tab-login");
const tabSignup = document.getElementById("tab-signup");
const message = document.getElementById("auth-message");

/* ---------------- Tabs ---------------- */
function showTab(which) {
  const login = which === "login";
  tabLogin.classList.toggle("active", login);
  tabSignup.classList.toggle("active", !login);
  loginForm.classList.toggle("hidden", !login);
  signupForm.classList.toggle("hidden", login);
  setMessage(message, "");
}

tabLogin.addEventListener("click", () => showTab("login"));
tabSignup.addEventListener("click", () => showTab("signup"));

const params = new URLSearchParams(window.location.search);
if (params.get("mode") === "signup") showTab("signup");
if (params.get("error") === "profile") {
  setMessage(message, "We couldn't load your profile. Please sign in again.", "error");
}

/* ---------------- Sign up ---------------- */
signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("signup-submit");

  const name = document.getElementById("signup-name").value.trim();
  const email = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;
  const role = signupForm.querySelector("input[name=role]:checked").value;

  if (!name) {
    setMessage(message, "Please enter your full name.", "error");
    return;
  }

  btn.disabled = true;
  setMessage(message, "Creating your account…");

  try {
    // The name and role travel as user metadata; the `handle_new_user`
    // trigger in schema.sql copies them into the profiles table.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name, role } },
    });
    if (error) throw error;

    if (!data.session) {
      // Email confirmation is switched on for this project.
      signupForm.reset();
      showTab("login");
      setMessage(
        message,
        "Account created. Check your email to confirm it, then log in.",
        "success"
      );
      return;
    }

    window.location.replace(homeFor(role));
  } catch (err) {
    setMessage(message, friendlyError(err), "error");
  } finally {
    btn.disabled = false;
  }
});

/* ---------------- Log in ---------------- */
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("login-submit");

  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  btn.disabled = true;
  setMessage(message, "Signing you in…");

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const profile = await loadProfile(data.user);
    window.location.replace(homeFor(profile?.role));
  } catch (err) {
    btn.disabled = false;
    setMessage(message, friendlyError(err), "error");
  }
});

/* ---------------- Already signed in? ---------------- */
const {
  data: { session },
} = await supabase.auth.getSession();

if (session) {
  const profile = await loadProfile(session.user);
  if (profile) window.location.replace(homeFor(profile.role));
}
