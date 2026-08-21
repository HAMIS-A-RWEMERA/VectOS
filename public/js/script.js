document.addEventListener('DOMContentLoaded', () => {
  // Sticky Header
  const header = document.querySelector('header');
  const backToTopBtn = document.getElementById('backToTop');

  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      header?.classList.add('scrolled');
      backToTopBtn?.classList.add('visible');
    } else {
      header?.classList.remove('scrolled');
      backToTopBtn?.classList.remove('visible');
    }
  });

  // Back to Top Click
  backToTopBtn?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Mobile Navigation Drawer Toggle
  const mobileToggle = document.getElementById('mobileToggle');
  const mobileNav = document.getElementById('mobileNav');
  const mobileClose = document.getElementById('mobileClose');

  mobileToggle?.addEventListener('click', () => {
    mobileNav?.classList.add('open');
  });

  mobileClose?.addEventListener('click', () => {
    mobileNav?.classList.remove('open');
  });

  // Lightbox Modal Functionality
  const lightbox = document.getElementById('lightboxModal');
  const lightboxImg = document.getElementById('lightboxImg');
  const lightboxTitle = document.getElementById('lightboxTitle');
  const lightboxDesc = document.getElementById('lightboxDesc');
  const lightboxClose = document.getElementById('lightboxClose');
  const lightboxVideoContainer = document.getElementById('lightboxVideoContainer');

  document.querySelectorAll('[data-lightbox]').forEach((item) => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const src = item.getAttribute('data-src');
      const title = item.getAttribute('data-title') || '';
      const desc = item.getAttribute('data-desc') || '';
      const isVideo = item.getAttribute('data-is-video') === 'true';

      if (lightbox && lightboxImg && lightboxVideoContainer) {
        if (isVideo) {
          lightboxImg.style.display = 'none';
          lightboxVideoContainer.style.display = 'block';
          
          let videoEmbedUrl = src;
          if (src.includes('youtube.com/watch?v=')) {
            videoEmbedUrl = src.replace('watch?v=', 'embed/');
          }
          lightboxVideoContainer.innerHTML = `<iframe width="800" height="450" src="${videoEmbedUrl}?autoplay=1" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="max-width: 100%; border-radius: 8px;"></iframe>`;
        } else {
          lightboxVideoContainer.style.display = 'none';
          lightboxVideoContainer.innerHTML = '';
          lightboxImg.style.display = 'block';
          lightboxImg.src = src;
        }

        if (lightboxTitle) lightboxTitle.textContent = title;
        if (lightboxDesc) lightboxDesc.textContent = desc;
        lightbox.classList.add('active');
      }
    });
  });

  lightboxClose?.addEventListener('click', () => {
    lightbox?.classList.remove('active');
    if (lightboxVideoContainer) lightboxVideoContainer.innerHTML = '';
  });

  lightbox?.addEventListener('click', (e) => {
    if (e.target === lightbox) {
      lightbox.classList.remove('active');
      if (lightboxVideoContainer) lightboxVideoContainer.innerHTML = '';
    }
  });

  // Gallery Filter Tabs
  const filterBtns = document.querySelectorAll('.filter-btn');
  const galleryItems = document.querySelectorAll('.gallery-item');

  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      const filter = btn.getAttribute('data-filter');

      galleryItems.forEach((item) => {
        if (filter === 'all' || item.getAttribute('data-category') === filter) {
          item.style.display = 'block';
        } else {
          item.style.display = 'none';
        }
      });
    });
  });

  // Booking Flow Logic
  const serviceCards = document.querySelectorAll('.service-card');
  const selectedServiceInput = document.getElementById('selectedServiceId');
  const selectedServiceTitle = document.getElementById('selectedServiceTitle');
  const bookingDateInput = document.getElementById('bookingDateInput');
  const bookingTimeInput = document.getElementById('bookingTimeInput');

  serviceCards.forEach((card) => {
    card.addEventListener('click', () => {
      serviceCards.forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');

      const serviceId = card.getAttribute('data-id');
      const serviceName = card.getAttribute('data-name');

      if (selectedServiceInput) selectedServiceInput.value = serviceId;
      if (selectedServiceTitle) selectedServiceTitle.textContent = serviceName;
    });
  });

  // Calendar Day Selection
  const calendarDates = document.querySelectorAll('.calendar-date.available');
  calendarDates.forEach((dateEl) => {
    dateEl.addEventListener('click', () => {
      calendarDates.forEach((d) => d.classList.remove('selected'));
      dateEl.classList.add('selected');

      const fullDate = dateEl.getAttribute('data-date');
      if (bookingDateInput) bookingDateInput.value = fullDate;

      const dateDisplay = document.getElementById('selectedDateDisplay');
      if (dateDisplay) dateDisplay.textContent = fullDate;
    });
  });

  // Time Slot Selection
  const timeSlots = document.querySelectorAll('.time-slot.available');
  timeSlots.forEach((slot) => {
    slot.addEventListener('click', () => {
      timeSlots.forEach((s) => s.classList.remove('selected'));
      slot.classList.add('selected');

      const timeVal = slot.getAttribute('data-time');
      if (bookingTimeInput) bookingTimeInput.value = timeVal;

      const timeDisplay = document.getElementById('selectedTimeDisplay');
      if (timeDisplay) timeDisplay.textContent = timeVal;
    });
  });

  // Booking Form Submission AJAX
  const bookingForm = document.getElementById('bookingForm');
  bookingForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(bookingForm);
    const data = Object.fromEntries(formData.entries());

    if (!data.service_id) {
      alert('Please select a service before proceeding.');
      return;
    }
    if (!data.date) {
      alert('Please select a preferred date on the calendar.');
      return;
    }
    if (!data.time) {
      alert('Please select an available time slot.');
      return;
    }

    try {
      const response = await fetch('/booking', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(data)
      });

      const resJson = await response.json();

      if (resJson.success) {
        const successMsg = document.getElementById('bookingSuccessMsg');
        if (successMsg) {
          successMsg.style.display = 'block';
          bookingForm.reset();
          window.scrollTo({ top: successMsg.offsetTop - 100, behavior: 'smooth' });
        } else {
          alert('Booking request submitted successfully! Wesley will contact you shortly.');
          window.location.reload();
        }
      } else {
        alert(resJson.message || 'Error processing booking request.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to submit booking request. Please check your network.');
    }
  });

  // Contact Form AJAX
  const contactForm = document.getElementById('contactForm');
  contactForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(contactForm);
    const data = Object.fromEntries(formData.entries());

    try {
      const response = await fetch('/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(data)
      });

      const resJson = await response.json();

      if (resJson.success) {
        const contactAlert = document.getElementById('contactSuccessAlert');
        if (contactAlert) {
          contactAlert.style.display = 'block';
          contactForm.reset();
        } else {
          alert('Message sent successfully!');
          contactForm.reset();
        }
      } else {
        alert(resJson.message || 'Failed to send message.');
      }
    } catch (err) {
      console.error(err);
      alert('An error occurred. Please try again.');
    }
  });
});
