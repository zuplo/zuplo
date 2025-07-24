#!/usr/bin/env node

/**
 * OpenMeter Setup Script
 * 
 * This script initializes the OpenMeter configuration for the metered monetization example.
 * It creates the necessary meter for tracking API requests that will be used for billing
 * and usage monitoring.
 * 
 * What this script does:
 * - Connects to your OpenMeter instance
 * - Creates a meter named "api_requests_total" that counts API requests
 * - Creates a feature for API requests
 * - Creates a "Free" plan with monthly billing
 * - Publishes the plan
 * - Sets up the foundation for metered billing based on API usage
 * 
 * Required Environment Variables:
 * - OPENMETER_API_KEY: Your OpenMeter API key (required)
 *   Get this from your OpenMeter dashboard at https://openmeter.cloud
 * 
 * Optional Environment Variables:
 * - OPENMETER_URL: OpenMeter instance URL (defaults to https://openmeter.cloud)
 *   Only needed if you're using a self-hosted OpenMeter instance
 * 
 * Usage:
 *   node setup.js
 * 
 * Note: You can set environment variables in a .env file in the project root
 */

import { OpenMeter } from '@openmeter/sdk';
import * as dotenv from 'dotenv';

// Load environment variables from .env file if it exists
dotenv.config();

const openmeter = new OpenMeter({
  baseUrl: process.env.OPENMETER_URL || 'https://openmeter.cloud',
  apiKey: process.env.OPENMETER_API_KEY,
});

async function setupOpenMeter() {
  console.log('\x1b[36m- Setting up OpenMeter...\x1b[0m');

  if (!process.env.OPENMETER_API_KEY) {
    console.error('\x1b[31m- OPENMETER_API_KEY environment variable is required\x1b[0m');
    console.log('\x1b[33m- Please set your OpenMeter API key in your environment variables or .env file\x1b[0m');
    process.exit(1);
  }

  let setupSuccessful = true;

  // Step 1: Create meter with slug api_requests_total
  console.log('\x1b[34m- Creating meter: api_requests_total...\x1b[0m');
  
  try {
    const meterData = {
      slug: 'api_requests_total',
      displayName: 'API Requests Total',
      description: 'Total count of API requests made by users',
      aggregation: 'COUNT',
      eventType: 'request'
    };

    const meter = await openmeter.meters.create(meterData)
    console.log('\x1b[32m+ Successfully created meter:\x1b[0m', meter.slug);
  } catch (error) {
    if (error.status === 409) {
      console.log('\x1b[33m- Meter "api_requests_total" already exists, skipping creation\x1b[0m');
    } else {
      console.error('\x1b[31m- Error creating meter:\x1b[0m', error.message);
      setupSuccessful = false;
    }
  }

  // Step 2: Create feature for API requests
  console.log('\x1b[34m- Creating feature: API Requests...\x1b[0m');
  
  try {
    const featureData = {
      key: 'api_requests',
      meterSlug: 'api_requests_total',
      name: 'API Requests'
    };

    const feature = await openmeter.features.create(featureData);
    console.log('\x1b[32m+ Successfully created feature:\x1b[0m', feature.name);
  } catch (error) {
    if (error.status === 409) {
      console.log('\x1b[33m- Feature "API Requests" already exists, skipping creation\x1b[0m');
    } else {
      console.error('\x1b[31m- Error creating feature:\x1b[0m', error.message);
      setupSuccessful = false;
    }
  }

  // Step 3: Create a Free plan
  console.log('\x1b[34m- Creating plan: Free...\x1b[0m');
  
  let planId = null;
  try {
    const planData = {
      name: 'Free',
      key: 'free',
      currency: 'USD',
      billingCadence: 'P1M',
      phases: [
        {
          name: 'Free Plan Phase',
          key: 'free_phase',
          startAfter: 'P0D',
          duration: null,
          limit: {
            type: 'metered',
            value: parseInt(process.env.FREE_PLAN_LIMIT || 10)
          },
          rateCards: [
            {
              type: 'flat_fee',
              key: 'api_requests',
              name: 'Free API Requests',
              billingCadence: null,
              price: {
                type: 'flat',
                amount: "0"
              }
            }
          ]
        }
      ]
    };

    const plan = await openmeter.plans.create(planData);
    planId = plan.id;
    console.log('\x1b[32m+ Successfully created plan:\x1b[0m', plan.name);
  } catch (error) {
    if (error.status === 409) {
      console.log('\x1b[33m- Plan "Free" already exists, skipping creation\x1b[0m');
      // Try to get the existing plan to get its ID for publishing
      try {
        const existingPlans = await openmeter.plans.list();
        const existingPlan = existingPlans.find(p => p.key === 'free');
        if (existingPlan) {
          planId = existingPlan.id;
        }
      } catch (listError) {
        console.log('\x1b[33m- Could not retrieve existing plan ID for publishing step\x1b[0m');
      }
    } else {
      console.error('\x1b[31m- Error creating plan:\x1b[0m', error.message);
      setupSuccessful = false;
    }
  }

  // Step 4: Publish the plan
  if (planId) {
    console.log('\x1b[34m- Publishing plan...\x1b[0m');
    
    try {
      await openmeter.plans.publish(planId);
      console.log('\x1b[32m+ Successfully published plan\x1b[0m');
    } catch (error) {
      if (error.status === 409 || error.message?.includes('already published')) {
        console.log('\x1b[33m- Plan is already published, skipping publishing\x1b[0m');
      } else {
        console.error('\x1b[31m- Error publishing plan:\x1b[0m', error.message);
        setupSuccessful = false;
      }
    }
  } else {
    console.log('\x1b[33m- Skipping plan publishing - no plan ID available\x1b[0m');
    setupSuccessful = false;
  }

  if (setupSuccessful) {
    console.log('\x1b[32m+ OpenMeter setup completed successfully!\x1b[0m');
  } else {
    console.log('\x1b[33m- OpenMeter setup completed with some errors. Please check the messages above.\x1b[0m');
    process.exit(1);
  }
}

setupOpenMeter().catch((error) => {
  console.error('❌ Setup failed:', error.message);
  process.exit(1);
}); 