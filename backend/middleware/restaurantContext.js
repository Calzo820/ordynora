import prisma from "../lib/prisma.js";

export default async function restaurantContext(req, res, next) {
  try {
    const user = req.user;

    if (!user || !user.restaurantId) {
      return res.status(403).json({
        error: "Accesso negato",
      });
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: {
        id: user.restaurantId,
      },
    });

    if (!restaurant) {
      return res.status(404).json({
        error: "Ristorante non trovato",
      });
    }

    req.restaurant = restaurant;

    next();
  } catch (error) {
    console.error("restaurantContext error:", error);

    return res.status(500).json({
      error: "Errore server",
    });
  }
}
