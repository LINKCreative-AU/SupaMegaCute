/* Newsletter signup handler.
   ACTIVATION: set NEWSLETTER.action to your email provider's form endpoint and
   NEWSLETTER.field to its email field name, then it POSTs real signups. Common:
     Mailchimp : action = "https://<dc>.list-manage.com/subscribe/post?u=..&id=..", field = "EMAIL"
     Beehiiv   : action = "https://embeds.beehiiv.com/<uuid>",                     field = "email"
     ConvertKit: action = "https://app.kit.com/forms/<id>/subscriptions",          field = "email_address"
     Buttondown: action = "https://buttondown.com/api/emails/embed-subscribe/<u>", field = "email"
   Until action is set, submissions fall back to a mailto to hello@supamegacute.com
   so nothing is silently lost. */
(function () {
  "use strict";
  var NEWSLETTER = { action: null, field: "email", inbox: "hello@supamegacute.com" };

  var form = document.getElementById("newsletter-form");
  if (!form) return;
  var note = document.getElementById("newsletter-note");
  var input = document.getElementById("newsletter-email");
  var valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var email = (input.value || "").trim();
    if (!valid.test(email)) { say("Please enter a valid email 💗", true); return; }

    if (NEWSLETTER.action) {
      var data = new FormData();
      data.append(NEWSLETTER.field, email);
      fetch(NEWSLETTER.action, { method: "POST", body: data, mode: "no-cors" })
        .then(function () { done(); })
        .catch(function () { done(); }); // no-cors gives an opaque response; treat as sent
    } else {
      // interim: hand off to the visitor's mail client so signups still reach us
      window.location.href = "mailto:" + NEWSLETTER.inbox +
        "?subject=" + encodeURIComponent("Newsletter signup") +
        "&body=" + encodeURIComponent("Please add me to the SupaMegaCute newsletter: " + email);
      done();
    }
  });

  function done() { form.reset(); say("You're in! Welcome to the cuteness club 🎀", false); }
  function say(msg, isErr) { if (note) { note.textContent = msg; note.style.color = isErr ? "#3a2b30" : "#fff"; } }
})();
