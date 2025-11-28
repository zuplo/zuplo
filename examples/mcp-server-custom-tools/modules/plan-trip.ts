import { ZuploContext, ZuploRequest } from "@zuplo/runtime";

export default async function (request: ZuploRequest, context: ZuploContext) {

  // Get the destination city from the inbound request
  const { destination } = await request.json();

  // Ensure we always have the same casing on the destination
  const city = destination.toLowerCase().replace(/\s+/g, "-");

  // Fetch weather data from API
  const weatherResp = await context.invokeRoute(`/weather/${city}`);
  if (!weatherResp.ok) {
    throw new Error(`Could not fetch weather for ${destination}`);
  }
  const weather = await weatherResp.json();

  // Fetch activities from API
  const activitiesResp = await context.invokeRoute(`/activities/${city}`);
  if (!activitiesResp.ok) {
    throw new Error(`Could not fetch activities for ${destination}`);
  }
  const activities = await activitiesResp.json();

  // Fetch packing list based on climate from API
  const packingResp = await context.invokeRoute(`/packing/${weather.climate_type}`);
  if (!packingResp.ok) {
    throw new Error(`Could not fetch packing list for ${weather.climate_type} climate`);
  }
  const packing = await packingResp.json();

  // Analyze weather for rainy days
  const rainyDays = weather.forecast.filter(
    (day: any) => day.precipitation_chance >= 50
  );
  const hasSignificantRain = rainyDays.length > 0;

  // Filter activities based on weather
  const recommendedActivities = activities.activities.map((activity: any) => ({
    ...activity,
    weather_suitable: hasSignificantRain ? activity.type === "indoor" : true,
  }));

  // Combine the responses together as a single object for the main response returned to the LLM
  return {
    destination: weather.city,
    climate: weather.climate_type,
    weather_summary: {
      forecast_days: weather.forecast.length,
      temperature_range: {
        high: Math.max(...weather.forecast.map((d: any) => d.high_celsius)),
        low: Math.min(...weather.forecast.map((d: any) => d.low_celsius)),
      },
      rainy_days: rainyDays.length,
      rain_warning: hasSignificantRain
        ? `Oh no! Rain is expected on ${rainyDays.length} day(s). Pack accordingly and consider indoor activities.`
        : null,
    },
    activities: recommendedActivities,
    packing: {
      ...packing,
      rain_gear_priority: hasSignificantRain ? "high" : "low",
    },
  };
}