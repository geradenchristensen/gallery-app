/**
 * @jest-environment jsdom
 */

describe('Flaky Timing-Based Tests', () => {
  let mockHTML;

  beforeEach(() => {
    mockHTML = `
      <div class="async-container">
        <button id="load-data-btn">Load Data</button>
        <div id="data-display"></div>
        <div class="spinner" style="display: none;">Loading...</div>
      </div>
      <div class="animation-target"></div>
      <div class="delayed-element" style="opacity: 0;"></div>
    `;
    document.body.innerHTML = mockHTML;
  });

  // FLAKY TEST 1: Race condition with setTimeout
  test('should load data with proper timing (FLAKY: race condition)', async () => {
    const button = document.getElementById('load-data-btn');
    const display = document.getElementById('data-display');
    const spinner = document.querySelector('.spinner');

    // Mock async data loading with random delay
    const mockLoadData = () => {
      return new Promise((resolve) => {
        // Random delay between 80-200ms - creates more race condition opportunities
        const delay = Math.random() * 120 + 80;
        setTimeout(() => {
          display.textContent = 'Data loaded!';
          spinner.style.display = 'none';
          resolve('success');
        }, delay);
      });
    };

    spinner.style.display = 'block';

    // Await the load to complete before asserting results
    await mockLoadData();

    expect(display.textContent).toBe('Data loaded!');
    expect(spinner.style.display).toBe('none');
  });

  // FLAKY TEST 2: Animation timing dependency
  test('should complete animation within expected time (FLAKY: animation timing)', (done) => {
    const target = document.querySelector('.animation-target');
    let animationStarted = false;
    let animationCompleted = false;
    
    // Mock animation with variable duration
    const mockAnimate = () => {
      animationStarted = true;
      target.style.transition = 'transform 0.3s ease';
      target.style.transform = 'translateX(100px)';
      
      // Animation completion detection with timing issues - now more variable
      setTimeout(() => {
        animationCompleted = true;
      }, 200 + Math.random() * 200); // 200-400ms - much more inconsistent timing
    };

    mockAnimate();
    
    // Check animation state at fixed time - will fail ~65% due to variable completion time
    setTimeout(() => {
      expect(animationStarted).toBe(true);
      expect(animationCompleted).toBe(true); // FLAKY: will fail ~65% of the time
      expect(target.style.transform).toBe('translateX(100px)');
      done();
    }, 250); // Fixed 250ms check - often before completion
  });

  // FLAKY TEST 3: Async/await with insufficient waiting
  test('should handle multiple async operations (FLAKY: insufficient waiting)', async () => {
    const results = [];
    
    // Mock multiple async operations with different delays - increased delays
    const asyncOp1 = () => new Promise(resolve => {
      setTimeout(() => {
        results.push('op1');
        resolve('op1');
      }, Math.random() * 100 + 50); // 50-150ms
    });
    
    const asyncOp2 = () => new Promise(resolve => {
      setTimeout(() => {
        results.push('op2');
        resolve('op2');
      }, Math.random() * 150 + 80); // 80-230ms
    });
    
    const asyncOp3 = () => new Promise(resolve => {
      setTimeout(() => {
        results.push('op3');
        resolve('op3');
      }, Math.random() * 200 + 100); // 100-300ms - much longer delay
    });

    // Start all operations
    const promises = [asyncOp1(), asyncOp2(), asyncOp3()];
    
    // Wait for first two only - third will often not complete in time
    await Promise.all(promises.slice(0, 2));
    
    // Add minimal wait that's insufficient for op3
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // These assertions will fail ~70% of the time - op3 often not done
    expect(results).toContain('op1');
    expect(results).toContain('op2');
    expect(results).toContain('op3'); // FLAKY: op3 will often not be done
    expect(results).toHaveLength(3); // FLAKY: will often only have 2 elements
  });

  // FLAKY TEST 4: Event timing with debounce
  test('should handle debounced events correctly (FLAKY: debounce timing)', (done) => {
    let eventCount = 0;
    let lastEventTime = 0;
    
    // Mock debounced event handler with longer debounce
    const mockDebouncedHandler = (() => {
      let timeout;
      return () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          eventCount++;
          lastEventTime = Date.now();
        }, 180); // 180ms debounce - longer delay
      };
    })();

    // Trigger multiple events rapidly
    mockDebouncedHandler();
    setTimeout(() => mockDebouncedHandler(), 50);
    setTimeout(() => mockDebouncedHandler(), 100);
    setTimeout(() => mockDebouncedHandler(), 150);
    setTimeout(() => mockDebouncedHandler(), 200); // Additional event

    // Check results too early - debounce will often not have fired yet
    setTimeout(() => {
      expect(eventCount).toBe(1); // FLAKY: will be 0 about 70% of the time
      expect(lastEventTime).toBeGreaterThan(0); // FLAKY: will be 0 about 70% of the time
      done();
    }, 200); // Check at 200ms - often before 180ms debounce completes
  });

  // FLAKY TEST 5: Promise resolution order
  test('should resolve promises in expected order (FLAKY: promise timing)', async () => {
    const resolveOrder = [];
    
    // Create promises with overlapping random delays - more chaos
    const promise1 = new Promise(resolve => {
      setTimeout(() => {
        resolveOrder.push('first');
        resolve('first');
      }, Math.random() * 100 + 50); // 50-150ms
    });
    
    const promise2 = new Promise(resolve => {
      setTimeout(() => {
        resolveOrder.push('second');
        resolve('second');
      }, Math.random() * 120 + 40); // 40-160ms
    });
    
    const promise3 = new Promise(resolve => {
      setTimeout(() => {
        resolveOrder.push('third');
        resolve('third');
      }, Math.random() * 80 + 30); // 30-110ms
    });

    await Promise.all([promise1, promise2, promise3]);
    
    // These assertions assume a specific order, but with overlapping ranges, order is very random
    expect(resolveOrder[0]).toBe('third'); // FLAKY: ~67% chance of being wrong
    expect(resolveOrder[1]).toBe('first'); // FLAKY: ~67% chance of being wrong  
    expect(resolveOrder[2]).toBe('second'); // FLAKY: ~67% chance of being wrong
  });
});
