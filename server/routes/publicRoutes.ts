import { Router, Request, Response } from 'express';
import { queryAll, queryOne, execute } from '../database/db';

const router = Router();

// GET / - Home Page
router.get('/', async (req: Request, res: Response) => {
  try {
    const featuredFilms = await queryAll('SELECT * FROM films ORDER BY year DESC, id DESC LIMIT 3');
    const featuredPhotos = await queryAll('SELECT * FROM photos ORDER BY id DESC LIMIT 6');
    const services = await queryAll('SELECT * FROM services LIMIT 4');

    res.render('index', {
      title: 'WESLEY — African Cinema & Photography Studio',
      featuredFilms,
      featuredPhotos,
      services,
      path: '/'
    });
  } catch (error) {
    console.error('Home route error:', error);
    res.status(500).render('error', { message: 'Failed to load home page' });
  }
});

// GET /about - About Wesley
router.get('/about', async (req: Request, res: Response) => {
  res.render('about', {
    title: 'About Wesley — Filmmaker & Storyteller | Kigali, Rwanda',
    path: '/about'
  });
});

// GET /landscape - Landscape Photography
router.get('/landscape', async (req: Request, res: Response) => {
  try {
    const photos = await queryAll("SELECT * FROM photos WHERE category = 'landscape' ORDER BY id DESC");
    res.render('landscape', {
      title: 'Landscape Photography — Wesley Studio',
      photos,
      path: '/landscape'
    });
  } catch (error) {
    console.error('Landscape route error:', error);
    res.status(500).render('error', { message: 'Failed to load landscape gallery' });
  }
});

// GET /portrait - Portrait Photography
router.get('/portrait', async (req: Request, res: Response) => {
  try {
    const photos = await queryAll("SELECT * FROM photos WHERE category = 'portrait' ORDER BY id DESC");
    res.render('portrait', {
      title: 'Portrait Photography — Wesley Studio',
      photos,
      path: '/portrait'
    });
  } catch (error) {
    console.error('Portrait route error:', error);
    res.status(500).render('error', { message: 'Failed to load portrait gallery' });
  }
});

// GET /films - Films Portfolio
router.get('/films', async (req: Request, res: Response) => {
  try {
    const films = await queryAll('SELECT * FROM films ORDER BY year DESC, id DESC');
    res.render('films', {
      title: 'Films & Cinema Showcase — Wesley Studio',
      films,
      path: '/films'
    });
  } catch (error) {
    console.error('Films route error:', error);
    res.status(500).render('error', { message: 'Failed to load films showcase' });
  }
});

// GET /booking - Appointment Booking System
router.get('/booking', async (req: Request, res: Response) => {
  try {
    const services = await queryAll('SELECT * FROM services ORDER BY id ASC');
    const existingBookings = await queryAll("SELECT date, time, status FROM bookings WHERE status IN ('confirmed', 'pending')");
    const blockedAvailability = await queryAll("SELECT date, start_time, end_time, available FROM availability WHERE available = 0");

    res.render('booking', {
      title: 'Book a Session — Wesley Studio',
      services,
      existingBookings,
      blockedAvailability,
      path: '/booking',
      queryService: req.query.service || null,
      success: req.query.success === 'true'
    });
  } catch (error) {
    console.error('Booking page error:', error);
    res.status(500).render('error', { message: 'Failed to load booking page' });
  }
});

// POST /booking - Handle client booking submission
router.post('/booking', async (req: Request, res: Response) => {
  try {
    const { client_name, email, phone, service_id, date, time, location, message } = req.body;

    if (!client_name || !email || !phone || !service_id || !date || !time) {
      return res.status(400).json({ success: false, message: 'Please fill in all required fields.' });
    }

    // Check if slot is already confirmed
    const doubleBook = await queryOne(
      "SELECT id FROM bookings WHERE date = ? AND time = ? AND status = 'confirmed'",
      [date, time]
    );

    if (doubleBook) {
      return res.status(409).json({
        success: false,
        message: 'This time slot is already booked. Please choose another date or time.'
      });
    }

    await execute(
      `INSERT INTO bookings (client_name, email, phone, service_id, date, time, location, message, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [client_name, email, phone, service_id, date, time, location || 'Kigali', message || '']
    );

    if (req.xhr || req.headers.accept?.includes('json')) {
      return res.json({ success: true, message: 'Booking request submitted successfully!' });
    }

    res.redirect('/booking?success=true');
  } catch (error) {
    console.error('Booking post error:', error);
    res.status(500).json({ success: false, message: 'Internal server error processing booking.' });
  }
});

// GET /contact - Contact Page
router.get('/contact', async (req: Request, res: Response) => {
  res.render('contact', {
    title: 'Contact & Inquiry — Wesley Studio',
    path: '/contact',
    sent: req.query.sent === 'true'
  });
});

// POST /contact - Send message
router.post('/contact', async (req: Request, res: Response) => {
  try {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    await execute(
      'INSERT INTO messages (name, email, subject, message) VALUES (?, ?, ?, ?)',
      [name, email, subject, message]
    );

    if (req.xhr || req.headers.accept?.includes('json')) {
      return res.json({ success: true, message: 'Your message has been sent!' });
    }

    res.redirect('/contact?sent=true');
  } catch (error) {
    console.error('Contact post error:', error);
    res.status(500).json({ success: false, message: 'Failed to send message.' });
  }
});

export default router;
