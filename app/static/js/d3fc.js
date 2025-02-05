(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('d3-array'), require('d3-scale'), require('d3-time'), require('d3-random'), require('d3-fetch'), require('d3-path'), require('d3-selection'), require('d3-shape'), require('d3-dispatch'), require('d3-brush')) :
    typeof define === 'function' && define.amd ? define(['exports', 'd3-array', 'd3-scale', 'd3-time', 'd3-random', 'd3-fetch', 'd3-path', 'd3-selection', 'd3-shape', 'd3-dispatch', 'd3-brush'], factory) :
    (global = global || self, factory(global.fc = {}, global.d3, global.d3, global.d3, global.d3, global.d3, global.d3, global.d3, global.d3, global.d3, global.d3));
}(this, function (exports, d3Array, d3Scale, d3Time, d3Random, d3Fetch, d3Path, d3Selection, d3Shape, d3Dispatch, d3Brush) { 'use strict';

    var createReboundMethod = ((target, source, name) => {
      const method = source[name];

      if (typeof method !== 'function') {
        throw new Error(`Attempt to rebind ${name} which isn't a function on the source object`);
      }

      return (...args) => {
        var value = method.apply(source, args);
        return value === source ? target : value;
      };
    });

    var rebind = ((target, source, ...names) => {
      for (const name of names) {
        target[name] = createReboundMethod(target, source, name);
      }

      return target;
    });

    const createTransform = transforms => name => transforms.reduce((name, fn) => name && fn(name), name);

    var rebindAll = ((target, source, ...transforms) => {
      const transform = createTransform(transforms);

      for (const name of Object.keys(source)) {
        const result = transform(name);

        if (result) {
          target[result] = createReboundMethod(target, source, name);
        }
      }

      return target;
    });

    var regexify = (strsOrRegexes => strsOrRegexes.map(strOrRegex => typeof strOrRegex === 'string' ? new RegExp(`^${strOrRegex}$`) : strOrRegex));

    var exclude = ((...exclusions) => {
      exclusions = regexify(exclusions);
      return name => exclusions.every(exclusion => !exclusion.test(name)) && name;
    });

    var include = ((...inclusions) => {
      inclusions = regexify(inclusions);
      return name => inclusions.some(inclusion => inclusion.test(name)) && name;
    });

    var includeMap = (mappings => name => mappings[name]);

    const capitalizeFirstLetter = str => str[0].toUpperCase() + str.slice(1);

    var prefix = (prefix => name => prefix + capitalizeFirstLetter(name));

    function identity(d) {
      return d;
    }
    function noop(d) {}
    function functor(v) {
      return typeof v === 'function' ? v : () => v;
    }
    function convertNaN(value) {
      return typeof value === 'number' && isNaN(value) ? undefined : value;
    }

    function _slidingWindow () {
      let period = () => 10;

      let accumulator = noop;
      let value = identity;

      let defined = d => d != null;

      var slidingWindow = function (data) {
        const size = period.apply(this, arguments);
        const windowData = data.slice(0, size).map(value);
        return data.map((d, i) => {
          if (i >= size) {
            // Treat windowData as FIFO rolling buffer
            windowData.shift();
            windowData.push(value(d, i));
          }

          if (i < size - 1 || windowData.some(d => !defined(d))) {
            return accumulator(undefined, i);
          }

          return accumulator(windowData, i);
        });
      };

      slidingWindow.period = (...args) => {
        if (!args.length) {
          return period;
        }

        period = functor(args[0]);
        return slidingWindow;
      };

      slidingWindow.accumulator = (...args) => {
        if (!args.length) {
          return accumulator;
        }

        accumulator = args[0];
        return slidingWindow;
      };

      slidingWindow.defined = (...args) => {
        if (!args.length) {
          return defined;
        }

        defined = args[0];
        return slidingWindow;
      };

      slidingWindow.value = (...args) => {
        if (!args.length) {
          return value;
        }

        value = args[0];
        return slidingWindow;
      };

      return slidingWindow;
    }

    function bollingerBands () {
      let multiplier = 2;

      const slidingWindow = _slidingWindow().accumulator(values => {
        const stdDev = values && d3Array.deviation(values);
        const average = values && d3Array.mean(values);
        return {
          average: average,
          upper: convertNaN(average + multiplier * stdDev),
          lower: convertNaN(average - multiplier * stdDev)
        };
      });

      const bollingerBands = data => slidingWindow(data);

      bollingerBands.multiplier = (...args) => {
        if (!args.length) {
          return multiplier;
        }

        multiplier = args[0];
        return bollingerBands;
      };

      rebind(bollingerBands, slidingWindow, 'period', 'value');
      return bollingerBands;
    }

    function exponentialMovingAverage () {
      let value = identity;

      let period = () => 9;

      const initialMovingAverageAccumulator = period => {
        let values = [];
        return value => {
          let movingAverage;

          if (values.length < period) {
            if (value != null) {
              values.push(value);
            } else {
              values = [];
            }
          }

          if (values.length >= period) {
            movingAverage = d3Array.mean(values);
          }

          return movingAverage;
        };
      };

      const exponentialMovingAverage = function (data) {
        const size = period.apply(this, arguments);
        const alpha = 2 / (size + 1);
        const initialAccumulator = initialMovingAverageAccumulator(size);
        let ema;
        return data.map((d, i) => {
          const v = value(d, i);

          if (ema === undefined) {
            ema = initialAccumulator(v);
          } else {
            ema = v * alpha + (1 - alpha) * ema;
          }

          return convertNaN(ema);
        });
      };

      exponentialMovingAverage.period = (...args) => {
        if (!args.length) {
          return period;
        }

        period = functor(args[0]);
        return exponentialMovingAverage;
      };

      exponentialMovingAverage.value = (...args) => {
        if (!args.length) {
          return value;
        }

        value = args[0];
        return exponentialMovingAverage;
      };

      return exponentialMovingAverage;
    }

    function macd () {
      let value = identity;
      const fastEMA = exponentialMovingAverage().period(12);
      const slowEMA = exponentialMovingAverage().period(26);
      const signalEMA = exponentialMovingAverage().period(9);

      const macd = data => {
        fastEMA.value(value);
        slowEMA.value(value);
        const diff = d3Array.zip(fastEMA(data), slowEMA(data)).map(d => d[0] !== undefined && d[1] !== undefined ? d[0] - d[1] : undefined);
        const averageDiff = signalEMA(diff);
        return d3Array.zip(diff, averageDiff).map(d => ({
          macd: d[0],
          signal: d[1],
          divergence: d[0] !== undefined && d[1] !== undefined ? d[0] - d[1] : undefined
        }));
      };

      macd.value = (...args) => {
        if (!args.length) {
          return value;
        }

        value = args[0];
        return macd;
      };

      rebindAll(macd, fastEMA, includeMap({
        'period': 'fastPeriod'
      }));
      rebindAll(macd, slowEMA, includeMap({
        'period': 'slowPeriod'
      }));
      rebindAll(macd, signalEMA, includeMap({
        'period': 'signalPeriod'
      }));
      return macd;
    }

    function relativeStrengthIndex () {
      const slidingWindow = _slidingWindow().period(14);

      const wildersSmoothing = (values, prevAvg) => prevAvg + (values[values.length - 1] - prevAvg) / values.length;

      const downChange = ([prevClose, close]) => prevClose < close ? 0 : prevClose - close;

      const upChange = ([prevClose, close]) => prevClose > close ? 0 : close - prevClose;

      const updateAverage = (changes, prevAverage) => prevAverage !== undefined ? wildersSmoothing(changes, prevAverage) : d3Array.mean(changes);

      const makeAccumulator = () => {
        let prevClose;
        let downChangesAvg;
        let upChangesAvg;
        return closes => {
          if (!closes) {
            if (prevClose !== undefined) {
              prevClose = NaN;
            }

            return undefined;
          }

          if (prevClose === undefined) {
            prevClose = closes[0];
            return undefined;
          }

          const closePairs = d3Array.pairs([prevClose, ...closes]);
          downChangesAvg = updateAverage(closePairs.map(downChange), downChangesAvg);
          upChangesAvg = updateAverage(closePairs.map(upChange), upChangesAvg);
          const rs = !isNaN(prevClose) ? upChangesAvg / downChangesAvg : NaN;
          return convertNaN(100 - 100 / (1 + rs));
        };
      };

      var rsi = data => {
        const rsiAccumulator = makeAccumulator();
        slidingWindow.accumulator(rsiAccumulator);
        return slidingWindow(data);
      };

      rebind(rsi, slidingWindow, 'period', 'value');
      return rsi;
    }

    function movingAverage () {
      const slidingWindow = _slidingWindow().accumulator(values => values && d3Array.mean(values));

      const movingAverage = data => slidingWindow(data);

      rebind(movingAverage, slidingWindow, 'period', 'value');
      return movingAverage;
    }

    function stochasticOscillator () {
      let closeValue = (d, i) => d.close;

      let highValue = (d, i) => d.high;

      let lowValue = (d, i) => d.low;

      const kWindow = _slidingWindow().period(5).defined(d => closeValue(d) != null && highValue(d) != null && lowValue(d) != null).accumulator(values => {
        const maxHigh = values && d3Array.max(values, highValue);
        const minLow = values && d3Array.min(values, lowValue);
        const kValue = values && 100 * (closeValue(values[values.length - 1]) - minLow) / (maxHigh - minLow);
        return convertNaN(kValue);
      });
      const dWindow = movingAverage().period(3);

      const stochastic = data => {
        const kValues = kWindow(data);
        const dValues = dWindow(kValues);
        return kValues.map((k, i) => ({
          k: k,
          d: dValues[i]
        }));
      };

      stochastic.closeValue = (...args) => {
        if (!args.length) {
          return closeValue;
        }

        closeValue = args[0];
        return stochastic;
      };

      stochastic.highValue = (...args) => {
        if (!args.length) {
          return highValue;
        }

        highValue = args[0];
        return stochastic;
      };

      stochastic.lowValue = (...args) => {
        if (!args.length) {
          return lowValue;
        }

        lowValue = args[0];
        return stochastic;
      };

      rebindAll(stochastic, kWindow, includeMap({
        'period': 'kPeriod'
      }));
      rebindAll(stochastic, dWindow, includeMap({
        'period': 'dPeriod'
      }));
      return stochastic;
    }

    function forceIndex () {
      let volumeValue = (d, i) => d.volume;

      let closeValue = (d, i) => d.close;

      const emaComputer = exponentialMovingAverage().period(13);

      const slidingWindow = _slidingWindow().period(2).defined(d => closeValue(d) != null && volumeValue(d) != null).accumulator(values => values && convertNaN((closeValue(values[1]) - closeValue(values[0])) * volumeValue(values[1])));

      const force = data => {
        const forceIndex = slidingWindow(data);
        return emaComputer(forceIndex);
      };

      force.volumeValue = (...args) => {
        if (!args.length) {
          return volumeValue;
        }

        volumeValue = args[0];
        return force;
      };

      force.closeValue = (...args) => {
        if (!args.length) {
          return closeValue;
        }

        closeValue = args[0];
        return force;
      };

      rebind(force, emaComputer, 'period');
      return force;
    }

    function envelope () {
      let factor = 0.1;
      let value = identity;

      const envelope = data => data.map(d => {
        const lower = convertNaN(value(d) * (1.0 - factor));
        const upper = convertNaN(value(d) * (1.0 + factor));
        return {
          lower,
          upper
        };
      });

      envelope.factor = (...args) => {
        if (!args.length) {
          return factor;
        }

        factor = args[0];
        return envelope;
      };

      envelope.value = (...args) => {
        if (!args.length) {
          return value;
        }

        value = args[0];
        return envelope;
      };

      return envelope;
    }

    function elderRay () {
      let closeValue = (d, i) => d.close;

      let highValue = (d, i) => d.high;

      let lowValue = (d, i) => d.low;

      const emaComputer = exponentialMovingAverage().period(13);

      const elderRay = data => {
        emaComputer.value(closeValue);
        return d3Array.zip(data, emaComputer(data)).map(d => {
          const bullPower = convertNaN(highValue(d[0]) - d[1]);
          const bearPower = convertNaN(lowValue(d[0]) - d[1]);
          return {
            bullPower,
            bearPower
          };
        });
      };

      elderRay.closeValue = (...args) => {
        if (!args.length) {
          return closeValue;
        }

        closeValue = args[0];
        return elderRay;
      };

      elderRay.highValue = (...args) => {
        if (!args.length) {
          return highValue;
        }

        highValue = args[0];
        return elderRay;
      };

      elderRay.lowValue = (...args) => {
        if (!args.length) {
          return lowValue;
        }

        lowValue = args[0];
        return elderRay;
      };

      rebind(elderRay, emaComputer, 'period');
      return elderRay;
    }

    function identity$1 () {
      var identity = {};

      identity.distance = function (start, end) {
        return end - start;
      };

      identity.offset = function (start, offset) {
        return start instanceof Date ? new Date(start.getTime() + offset) : start + offset;
      };

      identity.clampUp = d => d;

      identity.clampDown = d => d;

      identity.copy = () => identity;

      return identity;
    }

    function tickFilter(ticks, discontinuityProvider) {
      const discontinuousTicks = [];

      for (const tick of ticks) {
        const up = discontinuityProvider.clampUp(tick);
        const down = discontinuityProvider.clampDown(tick);

        if (up === down) {
          discontinuousTicks.push(up);
        }
      }

      return discontinuousTicks;
    }

    function discontinuous(adaptedScale) {
      if (!arguments.length) {
        adaptedScale = d3Scale.scaleIdentity();
      }

      var discontinuityProvider = identity$1();

      const scale = value => {
        var domain = adaptedScale.domain();
        var range = adaptedScale.range(); // The discontinuityProvider is responsible for determine the distance between two points
        // along a scale that has discontinuities (i.e. sections that have been removed).
        // the scale for the given point 'x' is calculated as the ratio of the discontinuous distance
        // over the domain of this axis, versus the discontinuous distance to 'x'

        var totalDomainDistance = discontinuityProvider.distance(domain[0], domain[1]);
        var distanceToX = discontinuityProvider.distance(domain[0], value);
        var ratioToX = distanceToX / totalDomainDistance;
        var scaledByRange = ratioToX * (range[1] - range[0]) + range[0];
        return scaledByRange;
      };

      scale.invert = x => {
        var domain = adaptedScale.domain();
        var range = adaptedScale.range();
        var ratioToX = (x - range[0]) / (range[1] - range[0]);
        var totalDomainDistance = discontinuityProvider.distance(domain[0], domain[1]);
        var distanceToX = ratioToX * totalDomainDistance;
        return discontinuityProvider.offset(domain[0], distanceToX);
      };

      scale.domain = (...args) => {
        if (!args.length) {
          return adaptedScale.domain();
        }

        const newDomain = args[0]; // clamp the upper and lower domain values to ensure they
        // do not fall within a discontinuity

        var domainLower = discontinuityProvider.clampUp(newDomain[0]);
        var domainUpper = discontinuityProvider.clampDown(newDomain[1]);
        adaptedScale.domain([domainLower, domainUpper]);
        return scale;
      };

      scale.nice = () => {
        adaptedScale.nice();
        var domain = adaptedScale.domain();
        var domainLower = discontinuityProvider.clampUp(domain[0]);
        var domainUpper = discontinuityProvider.clampDown(domain[1]);
        adaptedScale.domain([domainLower, domainUpper]);
        return scale;
      };

      scale.ticks = (...args) => {
        var ticks = adaptedScale.ticks.apply(this, args);
        return tickFilter(ticks, discontinuityProvider);
      };

      scale.copy = () => discontinuous(adaptedScale.copy()).discontinuityProvider(discontinuityProvider.copy());

      scale.discontinuityProvider = (...args) => {
        if (!args.length) {
          return discontinuityProvider;
        }

        discontinuityProvider = args[0];
        return scale;
      };

      rebindAll(scale, adaptedScale, include('range', 'rangeRound', 'interpolate', 'clamp', 'tickFormat'));
      return scale;
    }

    const base = (dayAccessor, intervalDay, intervalSaturday, intervalMonday) => {
      // the indices returned by dayAccessor(date)
      const day = {
        sunday: 0,
        monday: 1,
        saturday: 6
      };
      const millisPerDay = 24 * 3600 * 1000;
      const millisPerWorkWeek = millisPerDay * 5;
      const millisPerWeek = millisPerDay * 7;
      const skipWeekends = {};

      const isWeekend = date => dayAccessor(date) === 0 || dayAccessor(date) === 6;

      skipWeekends.clampDown = date => {
        if (date && isWeekend(date)) {
          // round the date up to midnight
          const newDate = intervalDay.ceil(date); // then subtract the required number of days

          if (dayAccessor(newDate) === day.sunday) {
            return intervalDay.offset(newDate, -1);
          } else if (dayAccessor(newDate) === day.monday) {
            return intervalDay.offset(newDate, -2);
          } else {
            return newDate;
          }
        } else {
          return date;
        }
      };

      skipWeekends.clampUp = date => {
        if (date && isWeekend(date)) {
          // round the date down to midnight
          const newDate = intervalDay.floor(date); // then add the required number of days

          if (dayAccessor(newDate) === day.saturday) {
            return intervalDay.offset(newDate, 2);
          } else if (dayAccessor(newDate) === day.sunday) {
            return intervalDay.offset(newDate, 1);
          } else {
            return newDate;
          }
        } else {
          return date;
        }
      }; // returns the number of included milliseconds (i.e. those which do not fall)
      // within discontinuities, along this scale


      skipWeekends.distance = function (startDate, endDate) {
        startDate = skipWeekends.clampUp(startDate);
        endDate = skipWeekends.clampDown(endDate); // move the start date to the end of week boundary

        const offsetStart = intervalSaturday.ceil(startDate);

        if (endDate < offsetStart) {
          return endDate.getTime() - startDate.getTime();
        }

        const msAdded = offsetStart.getTime() - startDate.getTime(); // move the end date to the end of week boundary

        const offsetEnd = intervalSaturday.ceil(endDate);
        const msRemoved = offsetEnd.getTime() - endDate.getTime(); // determine how many weeks there are between these two dates
        // round to account for DST transitions

        const weeks = Math.round((offsetEnd.getTime() - offsetStart.getTime()) / millisPerWeek);
        return weeks * millisPerWorkWeek + msAdded - msRemoved;
      };

      skipWeekends.offset = function (startDate, ms) {
        let date = isWeekend(startDate) ? skipWeekends.clampUp(startDate) : startDate;

        if (ms === 0) {
          return date;
        }

        const isNegativeOffset = ms < 0;
        const isPositiveOffset = ms > 0;
        let remainingms = ms; // move to the end of week boundary for a postive offset or to the start of a week for a negative offset

        const weekBoundary = isNegativeOffset ? intervalMonday.floor(date) : intervalSaturday.ceil(date);
        remainingms -= weekBoundary.getTime() - date.getTime(); // if the distance to the boundary is greater than the number of ms
        // simply add the ms to the current date

        if (isNegativeOffset && remainingms > 0 || isPositiveOffset && remainingms < 0) {
          return new Date(date.getTime() + ms);
        } // skip the weekend for a positive offset


        date = isNegativeOffset ? weekBoundary : intervalDay.offset(weekBoundary, 2); // add all of the complete weeks to the date

        const completeWeeks = Math.floor(remainingms / millisPerWorkWeek);
        date = intervalDay.offset(date, completeWeeks * 7);
        remainingms -= completeWeeks * millisPerWorkWeek; // add the remaining time

        date = new Date(date.getTime() + remainingms);
        return date;
      };

      skipWeekends.copy = function () {
        return skipWeekends;
      };

      return skipWeekends;
    };
    var skipWeekends = (() => base(date => date.getDay(), d3Time.timeDay, d3Time.timeSaturday, d3Time.timeMonday));

    var skipUtcWeekends = (() => base(date => date.getUTCDay(), d3Time.utcDay, d3Time.utcSaturday, d3Time.utcMonday));

    const provider = (...ranges) => {
      const inRange = (number, range) => number > range[0] && number < range[1];

      const surroundsRange = (inner, outer) => inner[0] >= outer[0] && inner[1] <= outer[1];

      var identity = {};

      identity.distance = (start, end) => {
        start = identity.clampUp(start);
        end = identity.clampDown(end);
        const surroundedRanges = ranges.filter(r => surroundsRange(r, [start, end]));
        const rangeSizes = surroundedRanges.map(r => r[1] - r[0]);
        return end - start - rangeSizes.reduce((total, current) => total + current, 0);
      };

      const add = (value, offset) => value instanceof Date ? new Date(value.getTime() + offset) : value + offset;

      identity.offset = (location, offset) => {
        if (offset > 0) {
          let currentLocation = identity.clampUp(location);
          let offsetRemaining = offset;

          while (offsetRemaining > 0) {
            const futureRanges = ranges.filter(r => r[0] > currentLocation).sort((a, b) => a[0] - b[0]);

            if (futureRanges.length) {
              const nextRange = futureRanges[0];
              const delta = nextRange[0] - currentLocation;

              if (delta > offsetRemaining) {
                currentLocation = add(currentLocation, offsetRemaining);
                offsetRemaining = 0;
              } else {
                currentLocation = nextRange[1];
                offsetRemaining -= delta;
              }
            } else {
              currentLocation = add(currentLocation, offsetRemaining);
              offsetRemaining = 0;
            }
          }

          return currentLocation;
        } else {
          let currentLocation = identity.clampDown(location);
          let offsetRemaining = offset;

          while (offsetRemaining < 0) {
            const futureRanges = ranges.filter(r => r[1] < currentLocation).sort((a, b) => b[0] - a[0]);

            if (futureRanges.length) {
              const nextRange = futureRanges[0];
              const delta = nextRange[1] - currentLocation;

              if (delta < offsetRemaining) {
                currentLocation = add(currentLocation, offsetRemaining);
                offsetRemaining = 0;
              } else {
                currentLocation = nextRange[0];
                offsetRemaining -= delta;
              }
            } else {
              currentLocation = add(currentLocation, offsetRemaining);
              offsetRemaining = 0;
            }
          }

          return currentLocation;
        }
      };

      identity.clampUp = d => ranges.reduce((value, range) => inRange(value, range) ? range[1] : value, d);

      identity.clampDown = d => ranges.reduce((value, range) => inRange(value, range) ? range[0] : value, d);

      identity.copy = () => identity;

      return identity;
    };

    function linearExtent () {
      let accessors = [d => d];
      let pad = [0, 0];
      let padUnit = 'percent';
      let symmetricalAbout = null;
      let include = [];

      const instance = data => {
        const values = new Array(data.length);

        for (const accessor of accessors) {
          for (let i = 0; i < data.length; i++) {
            const value = accessor(data[i], i);

            if (Array.isArray(value)) {
              values.push(...value);
            } else {
              values.push(value);
            }
          }
        }

        const extent = [d3Array.min(values), d3Array.max(values)];
        extent[0] = extent[0] == null ? d3Array.min(include) : d3Array.min([extent[0], ...include]);
        extent[1] = extent[1] == null ? d3Array.max(include) : d3Array.max([extent[1], ...include]);

        if (symmetricalAbout != null) {
          const halfRange = Math.max(Math.abs(extent[1] - symmetricalAbout), Math.abs(extent[0] - symmetricalAbout));
          extent[0] = symmetricalAbout - halfRange;
          extent[1] = symmetricalAbout + halfRange;
        }

        switch (padUnit) {
          case 'domain':
            {
              extent[0] -= pad[0];
              extent[1] += pad[1];
              break;
            }

          case 'percent':
            {
              const delta = extent[1] - extent[0];
              extent[0] -= pad[0] * delta;
              extent[1] += pad[1] * delta;
              break;
            }

          default:
            throw new Error(`Unknown padUnit: ${padUnit}`);
        }

        return extent;
      };

      instance.accessors = (...args) => {
        if (!args.length) {
          return accessors;
        }

        accessors = args[0];
        return instance;
      };

      instance.pad = (...args) => {
        if (!args.length) {
          return pad;
        }

        pad = args[0];
        return instance;
      };

      instance.padUnit = (...args) => {
        if (!args.length) {
          return padUnit;
        }

        padUnit = args[0];
        return instance;
      };

      instance.include = (...args) => {
        if (!args.length) {
          return include;
        }

        include = args[0];
        return instance;
      };

      instance.symmetricalAbout = (...args) => {
        if (!args.length) {
          return symmetricalAbout;
        }

        symmetricalAbout = args[0];
        return instance;
      };

      return instance;
    }

    function time () {
      let accessors = [];
      let pad = [0, 0];
      let padUnit = 'percent';
      let symmetricalAbout = null;
      let include = [];
      const extent = linearExtent();

      const valueOf = date => date != null ? date.valueOf() : null;

      const instance = data => {
        const adaptedAccessors = accessors.map(accessor => (...args) => {
          const value = accessor(...args);
          return Array.isArray(value) ? value.map(valueOf) : valueOf(value);
        });
        extent.accessors(adaptedAccessors).pad(pad).padUnit(padUnit).symmetricalAbout(symmetricalAbout != null ? symmetricalAbout.valueOf() : null).include(include.map(date => date.valueOf()));
        return extent(data).map(value => new Date(value));
      };

      instance.accessors = (...args) => {
        if (!args.length) {
          return accessors;
        }

        accessors = args[0];
        return instance;
      };

      instance.pad = (...args) => {
        if (!args.length) {
          return pad;
        }

        pad = args[0];
        return instance;
      };

      instance.padUnit = (...args) => {
        if (!args.length) {
          return padUnit;
        }

        padUnit = args[0];
        return instance;
      };

      instance.include = (...args) => {
        if (!args.length) {
          return include;
        }

        include = args[0];
        return instance;
      };

      instance.symmetricalAbout = (...args) => {
        if (!args.length) {
          return symmetricalAbout;
        }

        symmetricalAbout = args[0];
        return instance;
      };

      return instance;
    }

    function geometricBrownianMotion () {
      let period = 1;
      let steps = 20;
      let mu = 0.1;
      let sigma = 0.1;
      let random = d3Random.randomNormal();

      var geometricBrownianMotion = (value = 0) => {
        const timeStep = period / steps;
        const pathData = [];

        for (let i = 0; i < steps + 1; i++) {
          pathData.push(value);
          const increment = random() * Math.sqrt(timeStep) * sigma + (mu - sigma * sigma / 2) * timeStep;
          value = value * Math.exp(increment);
        }

        return pathData;
      };

      geometricBrownianMotion.period = (...args) => {
        if (!args.length) {
          return period;
        }

        period = args[0];
        return geometricBrownianMotion;
      };

      geometricBrownianMotion.steps = (...args) => {
        if (!args.length) {
          return steps;
        }

        steps = args[0];
        return geometricBrownianMotion;
      };

      geometricBrownianMotion.mu = (...args) => {
        if (!args.length) {
          return mu;
        }

        mu = args[0];
        return geometricBrownianMotion;
      };

      geometricBrownianMotion.sigma = (...args) => {
        if (!args.length) {
          return sigma;
        }

        sigma = args[0];
        return geometricBrownianMotion;
      };

      geometricBrownianMotion.random = (...args) => {
        if (!args.length) {
          return random;
        }

        random = args[0];
        return geometricBrownianMotion;
      };

      return geometricBrownianMotion;
    }

    function functor$1(v) {
      return typeof v === 'function' ? v : () => v;
    }

    function financial () {
      let startDate = new Date();
      let startPrice = 100;
      let interval = d3Time.timeDay;
      let intervalStep = 1;
      let unitInterval = d3Time.timeYear;
      let unitIntervalStep = 1;
      let filter = null;

      let volume = () => {
        const normal = d3Random.randomNormal(1, 0.1);
        return Math.ceil(normal() * 1000);
      };

      const gbm = geometricBrownianMotion();

      const getOffsetPeriod = date => {
        const unitMilliseconds = unitInterval.offset(date, unitIntervalStep) - date;
        return (interval.offset(date, intervalStep) - date) / unitMilliseconds;
      };

      const calculateOHLC = (start, price) => {
        const period = getOffsetPeriod(start);
        const prices = gbm.period(period)(price);
        const ohlc = {
          date: start,
          open: prices[0],
          high: Math.max.apply(Math, prices),
          low: Math.min.apply(Math, prices),
          close: prices[gbm.steps()]
        };
        ohlc.volume = volume(ohlc);
        return ohlc;
      };

      const getNextDatum = ohlc => {
        let date, price, filtered;

        do {
          date = ohlc ? interval.offset(ohlc.date, intervalStep) : new Date(startDate.getTime());
          price = ohlc ? ohlc.close : startPrice;
          ohlc = calculateOHLC(date, price);
          filtered = filter && !filter(ohlc);
        } while (filtered);

        return ohlc;
      };

      const makeStream = () => {
        let latest;
        const stream = {};

        stream.next = () => {
          const ohlc = getNextDatum(latest);
          latest = ohlc;
          return ohlc;
        };

        stream.take = numPoints => stream.until((d, i) => !numPoints || numPoints < 0 || i === numPoints);

        stream.until = comparison => {
          const data = [];
          let index = 0;
          let ohlc = getNextDatum(latest);
          let compared = comparison && !comparison(ohlc, index);

          while (compared) {
            data.push(ohlc);
            latest = ohlc;
            ohlc = getNextDatum(latest);
            index += 1;
            compared = comparison && !comparison(ohlc, index);
          }

          return data;
        };

        return stream;
      };

      const financial = numPoints => makeStream().take(numPoints);

      financial.stream = makeStream;

      if (typeof Symbol !== 'function' || typeof Symbol.iterator !== 'symbol') {
        throw new Error('d3fc-random-data depends on Symbol. Make sure that you load a polyfill in older browsers. See README.');
      }

      financial[Symbol.iterator] = () => {
        const stream = makeStream();
        return {
          next: () => ({
            value: stream.next(),
            done: false
          })
        };
      };

      financial.startDate = (...args) => {
        if (!args.length) {
          return startDate;
        }

        startDate = args[0];
        return financial;
      };

      financial.startPrice = (...args) => {
        if (!args.length) {
          return startPrice;
        }

        startPrice = args[0];
        return financial;
      };

      financial.interval = (...args) => {
        if (!args.length) {
          return interval;
        }

        interval = args[0];
        return financial;
      };

      financial.intervalStep = (...args) => {
        if (!args.length) {
          return intervalStep;
        }

        intervalStep = args[0];
        return financial;
      };

      financial.unitInterval = (...args) => {
        if (!args.length) {
          return unitInterval;
        }

        unitInterval = args[0];
        return financial;
      };

      financial.unitIntervalStep = (...args) => {
        if (!args.length) {
          return unitIntervalStep;
        }

        unitIntervalStep = args[0];
        return financial;
      };

      financial.filter = (...args) => {
        if (!args.length) {
          return filter;
        }

        filter = args[0];
        return financial;
      };

      financial.volume = (...args) => {
        if (!args.length) {
          return volume;
        }

        volume = functor$1(args[0]);
        return financial;
      };

      rebindAll(financial, gbm);
      return financial;
    }

    function skipWeekends$1 (datum) {
      const day = datum.date.getDay();
      return !(day === 0 || day === 6);
    }

    function gdax () {
      var product = 'BTC-USD';
      var start = null;
      var end = null;
      var granularity = null;

      var gdax = function () {
        var params = [];

        if (start != null) {
          params.push('start=' + start.toISOString());
        }

        if (end != null) {
          params.push('end=' + end.toISOString());
        }

        if (granularity != null) {
          params.push('granularity=' + granularity);
        }

        var url = 'https://api.gdax.com/products/' + product + '/candles?' + params.join('&');
        return d3Fetch.json(url).then(function (data) {
          return data.map(function (d) {
            return {
              date: new Date(d[0] * 1000),
              open: d[3],
              high: d[2],
              low: d[1],
              close: d[4],
              volume: d[5]
            };
          });
        });
      };

      gdax.product = function (x) {
        if (!arguments.length) {
          return product;
        }

        product = x;
        return gdax;
      };

      gdax.start = function (x) {
        if (!arguments.length) {
          return start;
        }

        start = x;
        return gdax;
      };

      gdax.end = function (x) {
        if (!arguments.length) {
          return end;
        }

        end = x;
        return gdax;
      };

      gdax.granularity = function (x) {
        if (!arguments.length) {
          return granularity;
        }

        granularity = x;
        return gdax;
      };

      return gdax;
    }

    function bucket () {
      var bucketSize = 10;

      var bucket = data => bucketSize <= 1 ? data.map(d => [d]) : d3Array.range(0, Math.ceil(data.length / bucketSize)).map(i => data.slice(i * bucketSize, (i + 1) * bucketSize));

      bucket.bucketSize = function (x) {
        if (!arguments.length) {
          return bucketSize;
        }

        bucketSize = x;
        return bucket;
      };

      return bucket;
    }

    function largestTriangleOneBucket () {
      var dataBucketer = bucket();

      var x = d => d;

      var y = d => d;

      const largestTriangleOneBucket = data => {
        if (dataBucketer.bucketSize() >= data.length) {
          return data;
        }

        var pointAreas = calculateAreaOfPoints(data);
        var pointAreaBuckets = dataBucketer(pointAreas);
        var buckets = dataBucketer(data.slice(1, data.length - 1));
        var subsampledData = buckets.map((thisBucket, i) => {
          var pointAreaBucket = pointAreaBuckets[i];
          var maxArea = d3Array.max(pointAreaBucket);
          var currentMaxIndex = pointAreaBucket.indexOf(maxArea);
          return thisBucket[currentMaxIndex];
        }); // First and last data points are their own buckets.

        return [].concat([data[0]], subsampledData, [data[data.length - 1]]);
      };

      function calculateAreaOfPoints(data) {
        var xyData = data.map(point => [x(point), y(point)]);
        var pointAreas = d3Array.range(1, xyData.length - 1).map(i => {
          var lastPoint = xyData[i - 1];
          var thisPoint = xyData[i];
          var nextPoint = xyData[i + 1];
          return 0.5 * Math.abs((lastPoint[0] - nextPoint[0]) * (thisPoint[1] - lastPoint[1]) - (lastPoint[0] - thisPoint[0]) * (nextPoint[1] - lastPoint[1]));
        });
        return pointAreas;
      }

      rebind(largestTriangleOneBucket, dataBucketer, 'bucketSize');

      largestTriangleOneBucket.x = function (d) {
        if (!arguments.length) {
          return x;
        }

        x = d;
        return largestTriangleOneBucket;
      };

      largestTriangleOneBucket.y = function (d) {
        if (!arguments.length) {
          return y;
        }

        y = d;
        return largestTriangleOneBucket;
      };

      return largestTriangleOneBucket;
    }

    function largestTriangleThreeBucket () {
      var x = d => d;

      var y = d => d;

      var dataBucketer = bucket();

      const largestTriangleThreeBucket = data => {
        if (dataBucketer.bucketSize() >= data.length) {
          return data;
        }

        var buckets = dataBucketer(data.slice(1, data.length - 1));
        var firstBucket = data[0];
        var lastBucket = data[data.length - 1]; // Keep track of the last selected bucket info and all buckets
        // (for the next bucket average)

        var allBuckets = [].concat([firstBucket], buckets, [lastBucket]);
        var lastSelectedX = x(firstBucket);
        var lastSelectedY = y(firstBucket);
        var subsampledData = buckets.map((thisBucket, i) => {
          var nextAvgX = d3Array.mean(allBuckets[i + 1], x);
          var nextAvgY = d3Array.mean(allBuckets[i + 1], y);
          var xyData = thisBucket.map(item => [x(item), y(item)]);
          var areas = xyData.map(item => 0.5 * Math.abs((lastSelectedX - nextAvgX) * (item[1] - lastSelectedY) - (lastSelectedX - item[0]) * (nextAvgY - lastSelectedY)));
          var highestIndex = areas.indexOf(d3Array.max(areas));
          var highestXY = xyData[highestIndex];
          lastSelectedX = highestXY[0];
          lastSelectedY = highestXY[1];
          return thisBucket[highestIndex];
        }); // First and last data points are their own buckets.

        return [].concat([data[0]], subsampledData, [data[data.length - 1]]);
      };

      rebind(largestTriangleThreeBucket, dataBucketer, 'bucketSize');

      largestTriangleThreeBucket.x = function (d) {
        if (!arguments.length) {
          return x;
        }

        x = d;
        return largestTriangleThreeBucket;
      };

      largestTriangleThreeBucket.y = function (d) {
        if (!arguments.length) {
          return y;
        }

        y = d;
        return largestTriangleThreeBucket;
      };

      return largestTriangleThreeBucket;
    }

    function modeMedian () {
      var dataBucketer = bucket();

      var value = d => d;

      const modeMedian = data => {
        if (dataBucketer.bucketSize() > data.length) {
          return data;
        }

        var minMax = d3Array.extent(data, value);
        var buckets = dataBucketer(data.slice(1, data.length - 1));
        var subsampledData = buckets.map((thisBucket, i) => {
          var frequencies = {};
          var mostFrequent;
          var mostFrequentIndex;
          var singleMostFrequent = true;
          var values = thisBucket.map(value);
          var globalMinMax = values.filter(value => value === minMax[0] || value === minMax[1]).map(value => values.indexOf(value))[0];

          if (globalMinMax !== undefined) {
            return thisBucket[globalMinMax];
          }

          values.forEach((item, i) => {
            if (frequencies[item] === undefined) {
              frequencies[item] = 0;
            }

            frequencies[item]++;

            if (frequencies[item] > frequencies[mostFrequent] || mostFrequent === undefined) {
              mostFrequent = item;
              mostFrequentIndex = i;
              singleMostFrequent = true;
            } else if (frequencies[item] === frequencies[mostFrequent]) {
              singleMostFrequent = false;
            }
          });

          if (singleMostFrequent) {
            return thisBucket[mostFrequentIndex];
          } else {
            return thisBucket[Math.floor(thisBucket.length / 2)];
          }
        }); // First and last data points are their own buckets.

        return [].concat([data[0]], subsampledData, [data[data.length - 1]]);
      };

      rebind(modeMedian, dataBucketer, 'bucketSize');

      modeMedian.value = function (x) {
        if (!arguments.length) {
          return value;
        }

        value = x;
        return modeMedian;
      };

      return modeMedian;
    }

    var functor$2 = (v => typeof v === 'function' ? v : () => v);

    // OHLC has a fixed width, whilst the x, open, high, low and close positions are
    // obtained from each point via the supplied accessor functions.

    var shapeOhlc = (() => {
      let context = null;

      let x = d => d.date;

      let open = d => d.open;

      let high = d => d.high;

      let low = d => d.low;

      let close = d => d.close;

      let orient = 'vertical';
      let width = functor$2(3);

      const ohlc = function (data) {
        const drawingContext = context || d3Path.path();
        data.forEach(function (d, i) {
          const xValue = x(d, i);
          const yOpen = open(d, i);
          const yHigh = high(d, i);
          const yLow = low(d, i);
          const yClose = close(d, i);
          const halfWidth = width(d, i) / 2;

          if (orient === 'vertical') {
            drawingContext.moveTo(xValue, yLow);
            drawingContext.lineTo(xValue, yHigh);
            drawingContext.moveTo(xValue, yOpen);
            drawingContext.lineTo(xValue - halfWidth, yOpen);
            drawingContext.moveTo(xValue, yClose);
            drawingContext.lineTo(xValue + halfWidth, yClose);
          } else {
            drawingContext.moveTo(yLow, xValue);
            drawingContext.lineTo(yHigh, xValue);
            drawingContext.moveTo(yOpen, xValue);
            drawingContext.lineTo(yOpen, xValue + halfWidth);
            drawingContext.moveTo(yClose, xValue);
            drawingContext.lineTo(yClose, xValue - halfWidth);
          }
        });
        return context ? null : drawingContext.toString();
      };

      ohlc.context = (...args) => {
        if (!args.length) {
          return context;
        }

        context = args[0];
        return ohlc;
      };

      ohlc.x = (...args) => {
        if (!args.length) {
          return x;
        }

        x = functor$2(args[0]);
        return ohlc;
      };

      ohlc.open = (...args) => {
        if (!args.length) {
          return open;
        }

        open = functor$2(args[0]);
        return ohlc;
      };

      ohlc.high = (...args) => {
        if (!args.length) {
          return high;
        }

        high = functor$2(args[0]);
        return ohlc;
      };

      ohlc.low = (...args) => {
        if (!args.length) {
          return low;
        }

        low = functor$2(args[0]);
        return ohlc;
      };

      ohlc.close = (...args) => {
        if (!args.length) {
          return close;
        }

        close = functor$2(args[0]);
        return ohlc;
      };

      ohlc.width = (...args) => {
        if (!args.length) {
          return width;
        }

        width = functor$2(args[0]);
        return ohlc;
      };

      ohlc.orient = (...args) => {
        if (!args.length) {
          return orient;
        }

        orient = args[0];
        return ohlc;
      };

      return ohlc;
    });

    // bar has a fixed width, whilst the x, y and height are obtained from each data
    // point via the supplied accessor functions.

    var shapeBar = (() => {
      let context = null;

      let x = d => d.x;

      let y = d => d.y;

      let horizontalAlign = 'center';
      let verticalAlign = 'center';

      let height = d => d.height;

      let width = functor$2(3);

      const bar = function (data, index) {
        const drawingContext = context || d3Path.path();
        data.forEach(function (d, i) {
          const xValue = x.call(this, d, index || i);
          const yValue = y.call(this, d, index || i);
          const barHeight = height.call(this, d, index || i);
          const barWidth = width.call(this, d, index || i);
          let horizontalOffset;

          switch (horizontalAlign) {
            case 'left':
              horizontalOffset = barWidth;
              break;

            case 'right':
              horizontalOffset = 0;
              break;

            case 'center':
              horizontalOffset = barWidth / 2;
              break;

            default:
              throw new Error('Invalid horizontal alignment ' + horizontalAlign);
          }

          let verticalOffset;

          switch (verticalAlign) {
            case 'bottom':
              verticalOffset = -barHeight;
              break;

            case 'top':
              verticalOffset = 0;
              break;

            case 'center':
              verticalOffset = barHeight / 2;
              break;

            default:
              throw new Error('Invalid vertical alignment ' + verticalAlign);
          }

          drawingContext.rect(xValue - horizontalOffset, yValue - verticalOffset, barWidth, barHeight);
        }, this);
        return context ? null : drawingContext.toString();
      };

      bar.context = (...args) => {
        if (!args.length) {
          return context;
        }

        context = args[0];
        return bar;
      };

      bar.x = (...args) => {
        if (!args.length) {
          return x;
        }

        x = functor$2(args[0]);
        return bar;
      };

      bar.y = (...args) => {
        if (!args.length) {
          return y;
        }

        y = functor$2(args[0]);
        return bar;
      };

      bar.width = (...args) => {
        if (!args.length) {
          return width;
        }

        width = functor$2(args[0]);
        return bar;
      };

      bar.horizontalAlign = (...args) => {
        if (!args.length) {
          return horizontalAlign;
        }

        horizontalAlign = args[0];
        return bar;
      };

      bar.height = (...args) => {
        if (!args.length) {
          return height;
        }

        height = functor$2(args[0]);
        return bar;
      };

      bar.verticalAlign = (...args) => {
        if (!args.length) {
          return verticalAlign;
        }

        verticalAlign = args[0];
        return bar;
      };

      return bar;
    });

    // candlestick has a fixed width, whilst the x, open, high, low and close positions are
    // obtained from each point via the supplied accessor functions.

    var shapeCandlestick = (() => {
      let context = null;

      let x = d => d.date;

      let open = d => d.open;

      let high = d => d.high;

      let low = d => d.low;

      let close = d => d.close;

      let width = functor$2(3);

      const candlestick = function (data) {
        const drawingContext = context || d3Path.path();
        data.forEach(function (d, i) {
          const xValue = x(d, i);
          const yOpen = open(d, i);
          const yHigh = high(d, i);
          const yLow = low(d, i);
          const yClose = close(d, i);
          const barWidth = width(d, i);
          const halfBarWidth = barWidth / 2; // Body

          drawingContext.rect(xValue - halfBarWidth, yOpen, barWidth, yClose - yOpen); // High wick
          // // Move to the max price of close or open; draw the high wick
          // N.B. Math.min() is used as we're dealing with pixel values,
          // the lower the pixel value, the higher the price!

          drawingContext.moveTo(xValue, Math.min(yClose, yOpen));
          drawingContext.lineTo(xValue, yHigh); // Low wick
          // // Move to the min price of close or open; draw the low wick
          // N.B. Math.max() is used as we're dealing with pixel values,
          // the higher the pixel value, the lower the price!

          drawingContext.moveTo(xValue, Math.max(yClose, yOpen));
          drawingContext.lineTo(xValue, yLow);
        });
        return context ? null : drawingContext.toString();
      };

      candlestick.context = (...args) => {
        if (!args.length) {
          return context;
        }

        context = args[0];
        return candlestick;
      };

      candlestick.x = (...args) => {
        if (!args.length) {
          return x;
        }

        x = functor$2(args[0]);
        return candlestick;
      };

      candlestick.open = (...args) => {
        if (!args.length) {
          return open;
        }

        open = functor$2(args[0]);
        return candlestick;
      };

      candlestick.high = (...args) => {
        if (!args.length) {
          return high;
        }

        high = functor$2(args[0]);
        return candlestick;
      };

      candlestick.low = (...args) => {
        if (!args.length) {
          return low;
        }

        low = functor$2(args[0]);
        return candlestick;
      };

      candlestick.close = (...args) => {
        if (!args.length) {
          return close;
        }

        close = functor$2(args[0]);
        return candlestick;
      };

      candlestick.width = (...args) => {
        if (!args.length) {
          return width;
        }

        width = functor$2(args[0]);
        return candlestick;
      };

      return candlestick;
    });

    var shapeBoxPlot = (() => {
      let context = null;

      let value = d => d.value;

      let median = d => d.median;

      let upperQuartile = d => d.upperQuartile;

      let lowerQuartile = d => d.lowerQuartile;

      let high = d => d.high;

      let low = d => d.low;

      let orient = 'vertical';
      let width = functor$2(5);
      let cap = functor$2(0.5);

      const boxPlot = function (data) {
        const drawingContext = context || d3Path.path();
        data.forEach(function (d, i) {
          // naming convention is for vertical orientation
          const _value = value(d, i);

          const _width = width(d, i);

          const halfWidth = _width / 2;

          const capWidth = _width * cap(d, i);

          const halfCapWidth = capWidth / 2;

          const _high = high(d, i);

          const _upperQuartile = upperQuartile(d, i);

          const _median = median(d, i);

          const _lowerQuartile = lowerQuartile(d, i);

          const _low = low(d, i);

          const upperQuartileToLowerQuartile = _lowerQuartile - _upperQuartile;

          if (orient === 'vertical') {
            // Upper whisker
            drawingContext.moveTo(_value - halfCapWidth, _high);
            drawingContext.lineTo(_value + halfCapWidth, _high);
            drawingContext.moveTo(_value, _high);
            drawingContext.lineTo(_value, _upperQuartile); // Box

            drawingContext.rect(_value - halfWidth, _upperQuartile, _width, upperQuartileToLowerQuartile);
            drawingContext.moveTo(_value - halfWidth, _median); // Median line

            drawingContext.lineTo(_value + halfWidth, _median); // Lower whisker

            drawingContext.moveTo(_value, _lowerQuartile);
            drawingContext.lineTo(_value, _low);
            drawingContext.moveTo(_value - halfCapWidth, _low);
            drawingContext.lineTo(_value + halfCapWidth, _low);
          } else {
            // Lower whisker
            drawingContext.moveTo(_low, _value - halfCapWidth);
            drawingContext.lineTo(_low, _value + halfCapWidth);
            drawingContext.moveTo(_low, _value);
            drawingContext.lineTo(_lowerQuartile, _value); // Box

            drawingContext.rect(_lowerQuartile, _value - halfWidth, -upperQuartileToLowerQuartile, _width);
            drawingContext.moveTo(_median, _value - halfWidth);
            drawingContext.lineTo(_median, _value + halfWidth); // Upper whisker

            drawingContext.moveTo(_upperQuartile, _value);
            drawingContext.lineTo(_high, _value);
            drawingContext.moveTo(_high, _value - halfCapWidth);
            drawingContext.lineTo(_high, _value + halfCapWidth);
          }
        });
        return context ? null : drawingContext.toString();
      };

      boxPlot.context = (...args) => {
        if (!args.length) {
          return context;
        }

        context = args[0];
        return boxPlot;
      };

      boxPlot.value = (...args) => {
        if (!args.length) {
          return value;
        }

        value = functor$2(args[0]);
        return boxPlot;
      };

      boxPlot.median = (...args) => {
        if (!args.length) {
          return median;
        }

        median = functor$2(args[0]);
        return boxPlot;
      };

      boxPlot.upperQuartile = (...args) => {
        if (!args.length) {
          return upperQuartile;
        }

        upperQuartile = functor$2(args[0]);
        return boxPlot;
      };

      boxPlot.lowerQuartile = (...args) => {
        if (!args.length) {
          return lowerQuartile;
        }

        lowerQuartile = functor$2(args[0]);
        return boxPlot;
      };

      boxPlot.high = (...args) => {
        if (!args.length) {
          return high;
        }

        high = functor$2(args[0]);
        return boxPlot;
      };

      boxPlot.low = (...args) => {
        if (!args.length) {
          return low;
        }

        low = functor$2(args[0]);
        return boxPlot;
      };

      boxPlot.width = (...args) => {
        if (!args.length) {
          return width;
        }

        width = functor$2(args[0]);
        return boxPlot;
      };

      boxPlot.orient = (...args) => {
        if (!args.length) {
          return orient;
        }

        orient = args[0];
        return boxPlot;
      };

      boxPlot.cap = (...args) => {
        if (!args.length) {
          return cap;
        }

        cap = functor$2(args[0]);
        return boxPlot;
      };

      return boxPlot;
    });

    var shapeErrorBar = (() => {
      let context = null;

      let value = d => d.x;

      let high = d => d.high;

      let low = d => d.low;

      let orient = 'vertical';
      let width = functor$2(5);

      const errorBar = function (data) {
        const drawingContext = context || d3Path.path();
        data.forEach(function (d, i) {
          // naming convention is for vertical orientation
          const _value = value(d, i);

          const _width = width(d, i);

          const halfWidth = _width / 2;

          const _high = high(d, i);

          const _low = low(d, i);

          if (orient === 'vertical') {
            drawingContext.moveTo(_value - halfWidth, _high);
            drawingContext.lineTo(_value + halfWidth, _high);
            drawingContext.moveTo(_value, _high);
            drawingContext.lineTo(_value, _low);
            drawingContext.moveTo(_value - halfWidth, _low);
            drawingContext.lineTo(_value + halfWidth, _low);
          } else {
            drawingContext.moveTo(_low, _value - halfWidth);
            drawingContext.lineTo(_low, _value + halfWidth);
            drawingContext.moveTo(_low, _value);
            drawingContext.lineTo(_high, _value);
            drawingContext.moveTo(_high, _value - halfWidth);
            drawingContext.lineTo(_high, _value + halfWidth);
          }
        });
        return context ? null : drawingContext.toString();
      };

      errorBar.context = (...args) => {
        if (!args.length) {
          return context;
        }

        context = args[0];
        return errorBar;
      };

      errorBar.value = (...args) => {
        if (!args.length) {
          return value;
        }

        value = functor$2(args[0]);
        return errorBar;
      };

      errorBar.high = (...args) => {
        if (!args.length) {
          return high;
        }

        high = functor$2(args[0]);
        return errorBar;
      };

      errorBar.low = (...args) => {
        if (!args.length) {
          return low;
        }

        low = functor$2(args[0]);
        return errorBar;
      };

      errorBar.width = (...args) => {
        if (!args.length) {
          return width;
        }

        width = functor$2(args[0]);
        return errorBar;
      };

      errorBar.orient = (...args) => {
        if (!args.length) {
          return orient;
        }

        orient = args[0];
        return errorBar;
      };

      return errorBar;
    });

    var functor$3 = (d => typeof d === 'function' ? d : () => d);

    // "Caution: avoid interpolating to or from the number zero when the interpolator is used to generate
    // a string (such as with attr).
    // Very small values, when stringified, may be converted to scientific notation and
    // cause a temporarily invalid attribute or style property value.
    // For example, the number 0.0000001 is converted to the string "1e-7".
    // This is particularly noticeable when interpolating opacity values.
    // To avoid scientific notation, start or end the transition at 1e-6,
    // which is the smallest value that is not stringified in exponential notation."
    // - https://github.com/mbostock/d3/wiki/Transitions#d3_interpolateNumber
    const effectivelyZero = 1e-6; // Wrapper around d3's selectAll/data data-join, which allows decoration of the result.
    // This is achieved by appending the element to the enter selection before exposing it.
    // A default transition of fade in/out is also implicitly added but can be modified.

    var dataJoin = ((element, className) => {
      element = element || 'g';

      let key = (_, i) => i;

      let explicitTransition = null;

      const dataJoin = function (container, data) {
        data = data || (d => d);

        const implicitTransition = container.selection ? container : null;

        if (implicitTransition) {
          container = container.selection();
        }

        const selected = container.selectAll((d, i, nodes) => Array.from(nodes[i].childNodes).filter(node => node.nodeType === 1)).filter(className == null ? element : `${element}.${className}`);
        let update = selected.data(data, key);
        const enter = update.enter().append(element).attr('class', className);
        let exit = update.exit(); // automatically merge in the enter selection

        update = update.merge(enter); // if transitions are enabled apply a default fade in/out transition

        const transition = implicitTransition || explicitTransition;

        if (transition) {
          update = update.transition(transition).style('opacity', 1);
          enter.style('opacity', effectivelyZero);
          exit = exit.transition(transition).style('opacity', effectivelyZero);
        }

        exit.remove();

        update.enter = () => enter;

        update.exit = () => exit;

        return update;
      };

      dataJoin.element = (...args) => {
        if (!args.length) {
          return element;
        }

        element = args[0];
        return dataJoin;
      };

      dataJoin.className = (...args) => {
        if (!args.length) {
          return className;
        }

        className = args[0];
        return dataJoin;
      };

      dataJoin.key = (...args) => {
        if (!args.length) {
          return key;
        }

        key = args[0];
        return dataJoin;
      };

      dataJoin.transition = (...args) => {
        if (!args.length) {
          return explicitTransition;
        }

        explicitTransition = args[0];
        return dataJoin;
      };

      return dataJoin;
    });

    var label = (layoutStrategy => {
      let decorate = () => {};

      let size = () => [0, 0];

      let position = (d, i) => [d.x, d.y];

      let strategy = layoutStrategy || (x => x);

      let component = () => {};

      let xScale = d3Scale.scaleIdentity();
      let yScale = d3Scale.scaleIdentity();
      const dataJoin$1 = dataJoin('g', 'label');

      const label = selection => {
        selection.each((data, index, group) => {
          const g = dataJoin$1(d3Selection.select(group[index]), data).call(component); // obtain the rectangular bounding boxes for each child

          const nodes = g.nodes();
          const childRects = nodes.map((node, i) => {
            let d = d3Selection.select(node).datum();
            const pos = position(d, i, nodes);
            let childPos = [xScale(pos[0]), yScale(pos[1])];
            let childSize = size(d, i, nodes);
            return {
              hidden: false,
              x: childPos[0],
              y: childPos[1],
              width: childSize[0],
              height: childSize[1]
            };
          }); // apply the strategy to derive the layout. The strategy does not change the order
          // or number of label.

          const layout = strategy(childRects);
          g.attr('style', (_, i) => 'display:' + (layout[i].hidden ? 'none' : 'inherit')).attr('transform', (_, i) => 'translate(' + layout[i].x + ', ' + layout[i].y + ')') // set the layout width / height so that children can use SVG layout if required
          .attr('layout-width', (_, i) => layout[i].width).attr('layout-height', (_, i) => layout[i].height).attr('anchor-x', (d, i, g) => childRects[i].x - layout[i].x).attr('anchor-y', (d, i, g) => childRects[i].y - layout[i].y);
          g.call(component);
          decorate(g, data, index);
        });
      };

      rebindAll(label, dataJoin$1, include('key'));
      rebindAll(label, strategy);

      label.size = (...args) => {
        if (!args.length) {
          return size;
        }

        size = functor$3(args[0]);
        return label;
      };

      label.position = (...args) => {
        if (!args.length) {
          return position;
        }

        position = functor$3(args[0]);
        return label;
      };

      label.component = (...args) => {
        if (!args.length) {
          return component;
        }

        component = args[0];
        return label;
      };

      label.decorate = (...args) => {
        if (!args.length) {
          return decorate;
        }

        decorate = args[0];
        return label;
      };

      label.xScale = (...args) => {
        if (!args.length) {
          return xScale;
        }

        xScale = args[0];
        return label;
      };

      label.yScale = (...args) => {
        if (!args.length) {
          return yScale;
        }

        yScale = args[0];
        return label;
      };

      return label;
    });

    var textLabel = (layoutStrategy => {
      let padding = 2;

      let value = x => x;

      const textJoin = dataJoin('text');
      const rectJoin = dataJoin('rect');
      const pointJoin = dataJoin('circle');

      const textLabel = selection => {
        selection.each((data, index, group) => {
          const node = group[index];
          const nodeSelection = d3Selection.select(node);
          let width = Number(node.getAttribute('layout-width'));
          let height = Number(node.getAttribute('layout-height'));
          let rect = rectJoin(nodeSelection, [data]);
          rect.attr('width', width).attr('height', height);
          let anchorX = Number(node.getAttribute('anchor-x'));
          let anchorY = Number(node.getAttribute('anchor-y'));
          let circle = pointJoin(nodeSelection, [data]);
          circle.attr('r', 2).attr('cx', anchorX).attr('cy', anchorY);
          let text = textJoin(nodeSelection, [data]);
          text.enter().attr('dy', '0.9em').attr('transform', `translate(${padding}, ${padding})`);
          text.text(value);
        });
      };

      textLabel.padding = (...args) => {
        if (!args.length) {
          return padding;
        }

        padding = args[0];
        return textLabel;
      };

      textLabel.value = (...args) => {
        if (!args.length) {
          return value;
        }

        value = functor$3(args[0]);
        return textLabel;
      };

      return textLabel;
    });

    const isIntersecting = (a, b) => !(a.x >= b.x + b.width || a.x + a.width <= b.x || a.y >= b.y + b.height || a.y + a.height <= b.y);

    var intersect = ((a, b) => {
      if (isIntersecting(a, b)) {
        const left = Math.max(a.x, b.x);
        const right = Math.min(a.x + a.width, b.x + b.width);
        const top = Math.max(a.y, b.y);
        const bottom = Math.min(a.y + a.height, b.y + b.height);
        return (right - left) * (bottom - top);
      } else {
        return 0;
      }
    });

    // rectangles in the array

    const collisionArea = (rectangles, index) => d3Array.sum(rectangles.map((d, i) => index === i ? 0 : intersect(rectangles[index], d))); // computes the total overlapping area of all of the rectangles in the given array

    const getPlacement = (x, y, width, height, location) => ({
      x,
      y,
      width,
      height,
      location
    }); // returns all the potential placements of the given label


    var placements = (label => {
      const x = label.x;
      const y = label.y;
      const width = label.width;
      const height = label.height;
      return [getPlacement(x, y, width, height, 'bottom-right'), getPlacement(x - width, y, width, height, 'bottom-left'), getPlacement(x - width, y - height, width, height, 'top-left'), getPlacement(x, y - height, width, height, 'top-right'), getPlacement(x, y - height / 2, width, height, 'middle-right'), getPlacement(x - width / 2, y, width, height, 'bottom-center'), getPlacement(x - width, y - height / 2, width, height, 'middle-left'), getPlacement(x - width / 2, y - height, width, height, 'top-center')];
    });

    const substitute = (array, index, substitution) => [...array.slice(0, index), substitution, ...array.slice(index + 1)];

    const lessThan = (a, b) => a < b; // a layout takes an array of rectangles and allows their locations to be optimised.
    // it is constructed using two functions, locationScore, which score the placement of and
    // individual rectangle, and winningScore which takes the scores for a rectangle
    // at two different locations and assigns a winningScore.


    const layoutComponent = () => {
      let score = null;
      let winningScore = lessThan;

      let locationScore = () => 0;

      let rectangles;

      const evaluatePlacement = (placement, index) => score - locationScore(rectangles[index], index, rectangles) + locationScore(placement, index, substitute(rectangles, index, placement));

      const layout = (placement, index) => {
        if (!score) {
          score = d3Array.sum(rectangles.map((r, i) => locationScore(r, i, rectangles)));
        }

        const newScore = evaluatePlacement(placement, index);

        if (winningScore(newScore, score)) {
          return layoutComponent().locationScore(locationScore).winningScore(winningScore).score(newScore).rectangles(substitute(rectangles, index, placement));
        } else {
          return layout;
        }
      };

      layout.rectangles = (...args) => {
        if (!args.length) {
          return rectangles;
        }

        rectangles = args[0];
        return layout;
      };

      layout.score = (...args) => {
        if (!args.length) {
          return score;
        }

        score = args[0];
        return layout;
      };

      layout.winningScore = (...args) => {
        if (!args.length) {
          return winningScore;
        }

        winningScore = args[0];
        return layout;
      };

      layout.locationScore = (...args) => {
        if (!args.length) {
          return locationScore;
        }

        locationScore = args[0];
        return layout;
      };

      return layout;
    };

    var greedy = (() => {
      let bounds;

      const containerPenalty = rectangle => bounds ? rectangle.width * rectangle.height - intersect(rectangle, bounds) : 0;

      const penaltyForRectangle = (rectangle, index, rectangles) => collisionArea(rectangles, index) + containerPenalty(rectangle);

      const strategy = data => {
        let rectangles = layoutComponent().locationScore(penaltyForRectangle).rectangles(data);
        data.forEach((rectangle, index) => {
          placements(rectangle).forEach((placement, placementIndex) => {
            rectangles = rectangles(placement, index);
          });
        });
        return rectangles.rectangles();
      };

      strategy.bounds = (...args) => {
        if (!args.length) {
          return bounds;
        }

        bounds = args[0];
        return strategy;
      };

      return strategy;
    });

    const randomItem = array => array[randomIndex(array)];

    const randomIndex = array => Math.floor(Math.random() * array.length);

    var annealing = (() => {
      let temperature = 1000;
      let cooling = 1;
      let bounds;

      const orientationPenalty = rectangle => {
        switch (rectangle.location) {
          case 'bottom-right':
            return 0;

          case 'middle-right':
          case 'bottom-center':
            return rectangle.width * rectangle.height / 8;
        }

        return rectangle.width * rectangle.height / 4;
      };

      const containerPenalty = rectangle => bounds ? rectangle.width * rectangle.height - intersect(rectangle, bounds) : 0;

      const penaltyForRectangle = (rectangle, index, rectangles) => collisionArea(rectangles, index) + containerPenalty(rectangle) + orientationPenalty(rectangle);

      const strategy = data => {
        let currentTemperature = temperature; // use annealing to allow a new score to be picked even if it is worse than the old

        const winningScore = (newScore, oldScore) => Math.exp((oldScore - newScore) / currentTemperature) > Math.random();

        let rectangles = layoutComponent().locationScore(penaltyForRectangle).winningScore(winningScore).rectangles(data);

        while (currentTemperature > 0) {
          const index = randomIndex(data);
          const randomNewPlacement = randomItem(placements(data[index]));
          rectangles = rectangles(randomNewPlacement, index);
          currentTemperature -= cooling;
        }

        return rectangles.rectangles();
      };

      strategy.temperature = (...args) => {
        if (!args.length) {
          return temperature;
        }

        temperature = args[0];
        return strategy;
      };

      strategy.cooling = (...args) => {
        if (!args.length) {
          return cooling;
        }

        cooling = args[0];
        return strategy;
      };

      strategy.bounds = (...args) => {
        if (!args.length) {
          return bounds;
        }

        bounds = args[0];
        return strategy;
      };

      return strategy;
    });

    const scanForObject = (array, comparator) => array[d3Array.scan(array, comparator)];

    var removeOverlaps = (adaptedStrategy => {
      adaptedStrategy = adaptedStrategy || (x => x);

      const removeOverlaps = layout => {
        layout = adaptedStrategy(layout); // eslint-disable-next-line no-constant-condition

        while (true) {
          // find the collision area for all overlapping rectangles, hiding the one
          // with the greatest overlap
          const visible = layout.filter(d => !d.hidden);
          const collisions = visible.map((d, i) => [d, collisionArea(visible, i)]);
          const maximumCollision = scanForObject(collisions, (a, b) => b[1] - a[1]);

          if (maximumCollision[1] > 0) {
            maximumCollision[0].hidden = true;
          } else {
            break;
          }
        }

        return layout;
      };

      rebindAll(removeOverlaps, adaptedStrategy);
      return removeOverlaps;
    });

    var boundingBox = (() => {
      let bounds = [0, 0];

      const strategy = data => data.map((d, i) => {
        let tx = d.x;
        let ty = d.y;

        if (tx + d.width > bounds[0]) {
          tx -= d.width;
        }

        if (ty + d.height > bounds[1]) {
          ty -= d.height;
        }

        return {
          height: d.height,
          width: d.width,
          x: tx,
          y: ty
        };
      });

      strategy.bounds = (...args) => {
        if (!args.length) {
          return bounds;
        }

        bounds = args[0];
        return strategy;
      };

      return strategy;
    });

    var functor$4 = (d => typeof d === 'function' ? d : () => d);

    // Checks that passed properties are 'defined', meaning that calling them with (d, i) returns non null values
    function defined() {
      const outerArguments = arguments;
      return function (d, i) {
        for (let c = 0, j = outerArguments.length; c < j; c++) {
          if (outerArguments[c](d, i) == null) {
            return false;
          }
        }

        return true;
      };
    }

    // determines the offset required along the cross scale based
    // on the series alignment
    var alignOffset = ((align, width) => {
      switch (align) {
        case 'left':
          return width / 2;

        case 'right':
          return -width / 2;

        default:
          return 0;
      }
    });

    var createBase = (initialValues => {
      const env = Object.assign({}, initialValues);

      const base = () => {};

      Object.keys(env).forEach(key => {
        base[key] = (...args) => {
          if (!args.length) {
            return env[key];
          }

          env[key] = args[0];
          return base;
        };
      });
      return base;
    });

    var xyBase = (() => {
      let baseValue = () => 0;

      let crossValue = d => d.x;

      let mainValue = d => d.y;

      let align = 'center';

      let bandwidth = () => 5;

      let orient = 'vertical';
      const base = createBase({
        decorate: () => {},
        defined: (d, i) => defined(baseValue, crossValue, mainValue)(d, i),
        xScale: d3Scale.scaleIdentity(),
        yScale: d3Scale.scaleIdentity()
      });

      base.values = (d, i) => {
        const width = bandwidth(d, i);
        const offset = alignOffset(align, width);
        const xScale = base.xScale();
        const yScale = base.yScale();

        if (orient === 'vertical') {
          const y = yScale(mainValue(d, i), i);
          const y0 = yScale(baseValue(d, i), i);
          const x = xScale(crossValue(d, i), i) + offset;
          return {
            d,
            x,
            y,
            y0,
            width,
            height: y - y0,
            origin: [x, y],
            baseOrigin: [x, y0],
            transposedX: x,
            transposedY: y
          };
        } else {
          const y = xScale(mainValue(d, i), i);
          const y0 = xScale(baseValue(d, i), i);
          const x = yScale(crossValue(d, i), i) + offset;
          return {
            d,
            x,
            y,
            y0,
            width,
            height: y - y0,
            origin: [y, x],
            baseOrigin: [y0, x],
            transposedX: y,
            transposedY: x
          };
        }
      };

      base.xValues = () => orient === 'vertical' ? [crossValue] : [baseValue, mainValue];

      base.yValues = () => orient !== 'vertical' ? [crossValue] : [baseValue, mainValue];

      base.baseValue = (...args) => {
        if (!args.length) {
          return baseValue;
        }

        baseValue = functor$4(args[0]);
        return base;
      };

      base.crossValue = (...args) => {
        if (!args.length) {
          return crossValue;
        }

        crossValue = functor$4(args[0]);
        return base;
      };

      base.mainValue = (...args) => {
        if (!args.length) {
          return mainValue;
        }

        mainValue = functor$4(args[0]);
        return base;
      };

      base.bandwidth = (...args) => {
        if (!args.length) {
          return bandwidth;
        }

        bandwidth = functor$4(args[0]);
        return base;
      };

      base.align = (...args) => {
        if (!args.length) {
          return align;
        }

        align = args[0];
        return base;
      };

      base.orient = (...args) => {
        if (!args.length) {
          return orient;
        }

        orient = args[0];
        return base;
      };

      return base;
    });

    const red = '#c60';
    const green = '#6c0';
    const black = '#000';
    const gray = '#ddd';
    const darkGray = '#999';
    var colors = {
      red,
      green,
      black,
      gray,
      darkGray
    };

    var seriesSvgLine = (() => {
      const base = xyBase();
      const lineData = d3Shape.line().x((d, i) => base.values(d, i).transposedX).y((d, i) => base.values(d, i).transposedY);
      const join = dataJoin('path', 'line');

      const line = selection => {
        if (selection.selection) {
          join.transition(selection);
        }

        lineData.defined(base.defined());
        selection.each((data, index, group) => {
          const path = join(d3Selection.select(group[index]), [data]);
          path.enter().attr('fill', 'none').attr('stroke', colors.black);
          path.attr('d', lineData);
          base.decorate()(path, data, index);
        });
      };

      rebindAll(line, base, exclude('baseValue', 'bandwidth', 'align'));
      rebind(line, join, 'key');
      rebind(line, lineData, 'curve');
      return line;
    });

    var seriesCanvasLine = (() => {
      const base = xyBase();
      const lineData = d3Shape.line().x((d, i) => base.values(d, i).transposedX).y((d, i) => base.values(d, i).transposedY);

      const line = data => {
        const context = lineData.context();
        context.beginPath();
        context.strokeStyle = colors.black;
        context.fillStyle = 'transparent';
        base.decorate()(context, data);
        lineData.defined(base.defined())(data);
        context.fill();
        context.stroke();
        context.closePath();
      };

      rebindAll(line, base, exclude('baseValue', 'bandwidth', 'align'));
      rebind(line, lineData, 'curve', 'context');
      return line;
    });

    var baseScale = (() => {
      let domain = [0, 1];
      let range = [-1, 1];

      const base = () => {};

      base.domain = (...args) => {
        if (!args.length) {
          return domain;
        }

        domain = args[0];
        return base;
      };

      base.range = (...args) => {
        if (!args.length) {
          return range;
        }

        range = args[0];
        return base;
      };

      return base;
    });

    var bufferBuilder = (() => {
      const attributes = {};
      const uniforms = {};
      let elementIndices = null;

      const bufferBuilder = (programBuilder, program) => {
        const gl = programBuilder.context();
        Object.keys(attributes).forEach(name => {
          const attribute = attributes[name];

          if (typeof attribute !== 'function') {
            throw new Error(`Expected an attribute for ${name}, found ${attribute}`);
          }

          const location = gl.getAttribLocation(program, name);
          attribute.location(location)(programBuilder);
        });
        Object.keys(uniforms).forEach(name => {
          const uniform = uniforms[name];

          if (typeof uniform !== 'function') {
            throw new Error(`Expected a uniform for ${name}, found ${uniform}`);
          }

          const location = gl.getUniformLocation(program, name);
          uniform.location(location)(programBuilder);
        });

        if (elementIndices !== null) {
          elementIndices(programBuilder);
        }
      };

      bufferBuilder.flush = () => {
        Object.values(attributes).forEach(attribute => attribute.clear());
        Object.values(uniforms).forEach(uniform => uniform.clear());
        if (elementIndices !== null) elementIndices.clear();
      };

      bufferBuilder.attribute = (...args) => {
        if (args.length === 1) {
          return attributes[args[0]];
        }

        attributes[args[0]] = args[1];
        return bufferBuilder;
      };

      bufferBuilder.uniform = (...args) => {
        if (args.length === 1) {
          return uniforms[args[0]];
        }

        uniforms[args[0]] = args[1];
        return bufferBuilder;
      };

      bufferBuilder.elementIndices = (...args) => {
        if (!args.length) {
          return elementIndices;
        }

        elementIndices = args[0];
        return bufferBuilder;
      };

      return bufferBuilder;
    });

    var uniform = (initialData => {
      let location = -1;
      let data = initialData;
      let dirty = true;

      const build = programBuilder => {
        if (!dirty) {
          return;
        }

        const gl = programBuilder.context();

        if (Array.isArray(data)) {
          switch (data.length) {
            case 1:
              gl.uniform1fv(location, data);
              break;

            case 2:
              gl.uniform2fv(location, data);
              break;

            case 3:
              gl.uniform3fv(location, data);
              break;

            case 4:
              gl.uniform4fv(location, data);
              break;

            default:
              throw new Error(`Uniform supports up to 4 elements. ${data.length} provided.`);
          }
        } else {
          gl.uniform1f(location, data);
        }

        dirty = false;
      };

      build.clear = () => {
        dirty = true;
      };

      build.location = (...args) => {
        if (!args.length) {
          return location;
        }

        if (location !== args[0]) {
          location = args[0];
          dirty = true;
        }

        return build;
      };

      build.data = (...args) => {
        if (!args.length) {
          return data;
        }

        data = args[0];
        dirty = true;
        return build;
      };

      return build;
    });

    var drawModes = {
      POINTS: 0,
      LINES: 1,
      LINE_LOOP: 2,
      LINE_STRIP: 3,
      TRIANGLES: 4,
      TRIANGLE_STRIP: 5,
      TRIANGLE_FAN: 6
    };

    var programBuilder = (() => {
      let context = null;
      let program = null;
      let vertexShader = null;
      let fragmentShader = null;
      let programVertexShader = null;
      let programFragmentShader = null;
      let mode = drawModes.TRIANGLES;
      let buffers = bufferBuilder();
      let debug = false;
      let extInstancedArrays = null;
      let dirty = true;

      const build = count => {
        if (context == null) {
          return;
        }

        const vertexShaderSource = vertexShader();
        const fragmentShaderSource = fragmentShader();

        if (newProgram(program, vertexShaderSource, fragmentShaderSource)) {
          program = createProgram(vertexShaderSource, fragmentShaderSource);
          programVertexShader = vertexShaderSource;
          programFragmentShader = fragmentShaderSource;
          dirty = false;
        }

        context.useProgram(program);
        buffers.uniform('uScreen', uniform([context.canvas.width, context.canvas.height]));
        buffers(build, program);

        switch (mode) {
          case drawModes.TRIANGLES:
            {
              if (buffers.elementIndices() == null) {
                throw new Error('Element indices must be provided.');
              }

              extInstancedArrays.drawElementsInstancedANGLE(mode, buffers.elementIndices().data().length, context.UNSIGNED_SHORT, 0, count);
              break;
            }

          case drawModes.POINTS:
            {
              if (buffers.elementIndices() != null) {
                throw new Error('Element indices must not be provided.');
              }

              context.drawArrays(mode, 0, count);
              break;
            }

          default:
            {
              throw new Error(`Unsupported drawing mode ${mode}.`);
            }
        }
      };

      build.extInstancedArrays = () => {
        // This equates the choice of drawing mode with opting-in to instanced
        // rendering. These are not equivalent. However, we don't currently
        // have a use case for distinguishing between them.
        if (mode === drawModes.TRIANGLES) {
          return extInstancedArrays;
        }

        return null;
      };

      build.context = (...args) => {
        if (!args.length) {
          return context;
        }

        if (args[0] == null || args[0] !== context) {
          buffers.flush();
          dirty = true;
        }

        if (args[0] != null && args[0] !== context) {
          extInstancedArrays = args[0].getExtension('ANGLE_instanced_arrays');
        }

        context = args[0];
        return build;
      };

      build.buffers = (...args) => {
        if (!args.length) {
          return buffers;
        }

        buffers = args[0];
        return build;
      };

      build.vertexShader = (...args) => {
        if (!args.length) {
          return vertexShader;
        }

        vertexShader = args[0];
        return build;
      };

      build.fragmentShader = (...args) => {
        if (!args.length) {
          return fragmentShader;
        }

        fragmentShader = args[0];
        return build;
      };

      build.mode = (...args) => {
        if (!args.length) {
          return mode;
        }

        mode = args[0];
        return build;
      };

      build.debug = (...args) => {
        if (!args.length) {
          return debug;
        }

        debug = args[0];
        return build;
      };

      return build;

      function newProgram(program, vertexShader, fragmentShader) {
        if (!program || dirty) {
          return true;
        }

        return vertexShader !== programVertexShader || fragmentShader !== programFragmentShader;
      }

      function createProgram(vertexShaderSource, fragmentShaderSource) {
        const vertexShader = loadShader(vertexShaderSource, context.VERTEX_SHADER);
        const fragmentShader = loadShader(fragmentShaderSource, context.FRAGMENT_SHADER);
        const program = context.createProgram();
        context.attachShader(program, vertexShader);
        context.attachShader(program, fragmentShader);
        context.linkProgram(program);

        if (debug && !context.getProgramParameter(program, context.LINK_STATUS)) {
          const message = context.getProgramInfoLog(program);
          context.deleteProgram(program);
          throw new Error(`Failed to link program : ${message}
            Vertex Shader : ${vertexShaderSource}
            Fragment Shader : ${fragmentShaderSource}`);
        }

        return program;
      }

      function loadShader(source, type) {
        const shader = context.createShader(type);
        context.shaderSource(shader, source);
        context.compileShader(shader);

        if (debug && !context.getShaderParameter(shader, context.COMPILE_STATUS)) {
          const message = context.getShaderInfoLog(shader);
          context.deleteShader(shader);
          throw new Error(`Failed to compile shader : ${message}
            Shader : ${source}`);
        }

        return shader;
      }
    });

    var shaderBuilder = (base => {
      const shaderHeaders = [];
      const shaderBodies = [];

      const build = () => {
        return base(shaderHeaders.join('\n'), shaderBodies.join('\n'));
      };

      function append(array, element) {
        array.push(element);
      }

      function insert(array, element, before) {
        const beforeIndex = array.indexOf(before);
        array.splice(beforeIndex >= 0 ? beforeIndex : array.length, 0, element);
      }

      function appendIfNotExists(array, element) {
        const elementIndex = array.indexOf(element);

        if (elementIndex === -1) {
          array.push(element);
        }
      }

      build.appendHeader = header => {
        append(shaderHeaders, header);
        return build;
      };

      build.insertHeader = (header, before) => {
        insert(shaderHeaders, header, before);
        return build;
      };

      build.appendHeaderIfNotExists = header => {
        appendIfNotExists(shaderHeaders, header);
        return build;
      };

      build.appendBody = body => {
        append(shaderBodies, body);
        return build;
      };

      build.insertBody = (body, before) => {
        insert(shaderBodies, body, before);
        return build;
      };

      build.appendBodyIfNotExists = body => {
        appendIfNotExists(shaderBodies, body);
        return build;
      };

      return build;
    }); // inf is precalculated here for use in some functions (e.g. log scale calculations)

    const vertexShaderBase = (header, body) => `
precision mediump float;
float inf = 1.0 / 0.0;
${header}
void main() {
    ${body}
}`;
    const fragmentShaderBase = (header, body) => `
precision mediump float;
${header}
void main() {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    ${body}
}`;

    const fillColor = {
      header: `attribute vec4 aFillColor;
             varying vec4 vFillColor;`,
      body: `vFillColor = aFillColor;`
    };
    const strokeColor = {
      header: `attribute vec4 aStrokeColor;
             varying vec4 vStrokeColor;`,
      body: `vStrokeColor = aStrokeColor;`
    };
    const circle = {
      header: `
        attribute float aCrossValue;
        attribute float aMainValue;
        attribute float aSize;
        attribute float aDefined;

        uniform float uStrokeWidth;

        varying float vSize;
        varying float vDefined;`,
      body: `
        vDefined = aDefined;
        vSize = 2.0 * sqrt(aSize / 3.14159);
        gl_PointSize = vSize + uStrokeWidth + 1.0;
        gl_Position = vec4(aCrossValue, aMainValue, 0, 1);`
    };
    const star = {
      header: `
        attribute float aCrossValue;
        attribute float aMainValue;
        attribute float aSize;
        attribute float aDefined;

        uniform float uStrokeWidth;

        varying float vSize;
        varying float vDefined;`,
      body: `
        vDefined = aDefined;
        vSize = 4.0 * sqrt(aSize / 3.14159);
        gl_PointSize = vSize + uStrokeWidth + 1.0;
        gl_Position = vec4(aCrossValue, aMainValue, 0, 1);`
    };
    const wye = {
      header: `
        attribute float aCrossValue;
        attribute float aMainValue;
        attribute float aSize;
        attribute float aDefined;

        uniform float uStrokeWidth;

        varying float vSize;
        varying float vDefined;`,
      body: `
        vDefined = aDefined;
        vSize = 3.0 * sqrt(aSize / 3.14159);
        gl_PointSize = vSize + uStrokeWidth + 1.0;
        gl_Position = vec4(aCrossValue, aMainValue, 0, 1);`
    };
    const square = {
      header: `
        attribute float aCrossValue;
        attribute float aMainValue;
        attribute float aSize;
        attribute float aDefined;

        uniform float uStrokeWidth;

        varying float vSize;
        varying float vDefined;`,
      body: `
        vDefined = aDefined;
        vSize = sqrt(aSize);
        gl_PointSize = vSize + uStrokeWidth + 1.0;
        gl_Position = vec4(aCrossValue, aMainValue, 0, 1);`
    };
    const diamond = {
      header: `
        attribute float aCrossValue;
        attribute float aMainValue;
        attribute float aSize;
        attribute float aDefined;

        uniform float uStrokeWidth;

        varying float vSize;
        varying float vDefined;`,
      body: `
        vDefined = aDefined;
        vSize = sqrt(aSize);
        gl_PointSize = 2.0 * (vSize + uStrokeWidth + 1.0);
        gl_Position = vec4(aCrossValue, aMainValue, 0, 1);`
    };
    const triangle = {
      header: `
        attribute float aCrossValue;
        attribute float aMainValue;
        attribute float aSize;
        attribute float aDefined;

        uniform float uStrokeWidth;

        varying float vSize;
        varying float vDefined;`,
      body: `
        vDefined = aDefined;
        vSize = sqrt((16.0 * aSize) / (3.0 * sqrt(3.0)));
        gl_PointSize = vSize + uStrokeWidth + 1.0;
        gl_Position = vec4(aCrossValue, aMainValue, 0, 1);`
    };
    const cross = {
      header: `
        attribute float aCrossValue;
        attribute float aMainValue;
        attribute float aSize;
        attribute float aDefined;

        uniform float uStrokeWidth;

        varying float vSize;
        varying float vStrokeWidthRatio;
        varying float vDefined;`,
      body: `
        vDefined = aDefined;
        vSize = 3.0 * sqrt(aSize / 5.0);
        vStrokeWidthRatio = uStrokeWidth / (vSize + uStrokeWidth + 1.0);
        gl_PointSize = vSize + uStrokeWidth + 1.0;
        gl_Position = vec4(aCrossValue, aMainValue, 0, 1);`
    };
    const candlestick = {
      header: `
        attribute float aCrossValue;
        attribute float aBandwidth;
        attribute float aHighValue;
        attribute float aOpenValue;
        attribute float aCloseValue;
        attribute float aLowValue;
        attribute vec3 aCorner;
        attribute float aDefined;

        uniform vec2 uScreen;
        uniform float uStrokeWidth;

        varying float vColorIndicator;
        varying float vDefined;`,
      body: `
        vDefined = aDefined;
        vColorIndicator = sign(aCloseValue - aOpenValue);

        float isPositiveY = (sign(aCorner.y) + 1.0) / 2.0;
        float isNotPositiveY = 1.0 - isPositiveY;
        float isExtremeY = abs(aCorner.y) - 1.0;
        float isNotExtremeY = 1.0 - isExtremeY;
        float yValue =
         (isPositiveY * isExtremeY * aLowValue) +
         (isPositiveY * isNotExtremeY * aCloseValue) +
         (isNotPositiveY * isNotExtremeY * aOpenValue) +
         (isNotPositiveY * isExtremeY * aHighValue);

        float lineWidthXDirection = (isNotExtremeY * aCorner.x) + (isExtremeY * aCorner.z);
        float lineWidthYDirection = isNotExtremeY * sign(aCloseValue - aOpenValue) * aCorner.y;

        float bandwidthModifier = aBandwidth * aCorner.x / 2.0;

        float xModifier = (uStrokeWidth * lineWidthXDirection / 2.0) + bandwidthModifier;
        float yModifier = uStrokeWidth * lineWidthYDirection / 2.0;

        gl_Position = vec4(aCrossValue, yValue, 0, 1);`
    };
    const ohlc = {
      header: `
        attribute float aCrossValue;
        attribute float aBandwidth;
        attribute float aHighValue;
        attribute float aOpenValue;
        attribute float aCloseValue;
        attribute float aLowValue;
        attribute vec3 aCorner;
        attribute float aDefined;

        uniform vec2 uScreen;
        uniform float uStrokeWidth;

        varying float vColorIndicator;
        varying float vDefined;`,
      body: `
        vDefined = aDefined;
        vColorIndicator = sign(aCloseValue - aOpenValue);

        float isPositiveY = (sign(aCorner.y) + 1.0) / 2.0;
        float isNotPositiveY = 1.0 - isPositiveY;
        float isExtremeY = abs(aCorner.y) - 1.0;
        float isNotExtremeY = 1.0 - isExtremeY;
        float yValue =
            (isPositiveY * isExtremeY * aLowValue) +
            (isPositiveY * isNotExtremeY * aCloseValue) +
            (isNotPositiveY * isNotExtremeY * aOpenValue) +
            (isNotPositiveY * isExtremeY * aHighValue);

        float lineWidthXDirection = isExtremeY * aCorner.z;
        float lineWidthYDirection = isNotExtremeY * aCorner.z;

        float bandwidthModifier = isNotExtremeY * aCorner.x * aBandwidth / 2.0;

        float xModifier = (uStrokeWidth * lineWidthXDirection / 2.0) + bandwidthModifier;
        float yModifier = uStrokeWidth * lineWidthYDirection / 2.0;

        gl_Position = vec4(aCrossValue, yValue, 0, 1);`
    };
    const bar = {
      header: `
        attribute float aCrossValue;
        attribute float aBandwidth;
        attribute float aMainValue;
        attribute float aBaseValue;
        attribute vec2 aCorner;
        attribute float aDefined;

        uniform vec2 uScreen;
        uniform float uStrokeWidth;

        varying float vDefined;`,
      body: `
        vDefined = aDefined;
        float isBaseline = (1.0 - aCorner.y) / 2.0;
        float yValue = (isBaseline * aBaseValue) + ((1.0 - isBaseline) * aMainValue);

        float xModifier = aCorner.x * (aBandwidth) / 2.0;

        gl_Position = vec4(aCrossValue, yValue, 0, 1);`
    };
    const preScaleLine = {
      header: `
        attribute vec3 aCorner;
        attribute float aCrossNextNextValue;
        attribute float aMainNextNextValue;
        attribute float aCrossNextValue;
        attribute float aMainNextValue;
        attribute float aCrossValue;
        attribute float aMainValue;
        attribute float aCrossPrevValue;
        attribute float aMainPrevValue;
        attribute float aDefined;
        attribute float aDefinedNext;

        uniform float uStrokeWidth;
        uniform vec2 uScreen;

        varying float vDefined;`,
      body: `
        vDefined = aDefined * aDefinedNext;
        vec4 prev = vec4(aCrossPrevValue, aMainPrevValue, 0, 0);
        vec4 curr = vec4(aCrossValue, aMainValue, 0, 0);
        gl_Position = vec4(aCrossNextValue, aMainNextValue, 0, 1);
        vec4 nextNext = vec4(aCrossNextNextValue, aMainNextNextValue, 0, 0);`
    };
    const postScaleLine = {
      body: `
        vec4 currVertexPosition = gl_Position;
        vec4 nextVertexPosition = gl_Position;

        if (all(equal(curr.xy, prev.xy))) {
            prev.xy = curr.xy + normalize(curr.xy - currVertexPosition.xy);
        }
        if (all(equal(curr.xy, currVertexPosition.xy))) {
            currVertexPosition.xy = curr.xy + normalize(curr.xy - prev.xy);
        }
        vec2 A = normalize(normalize(curr.xy - prev.xy) * uScreen);
        vec2 B = normalize(normalize(currVertexPosition.xy - curr.xy) * uScreen);
        vec2 tangent = normalize(A + B);
        vec2 miter = vec2(-tangent.y, tangent.x);
        vec2 normalA = vec2(-A.y, A.x);
        float miterLength = 1.0 / dot(miter, normalA);
        vec2 point = normalize(A - B);
        if (miterLength > 10.0 && sign(aCorner.x * dot(miter, point)) > 0.0) {
            currVertexPosition.xy = curr.xy - (aCorner.x * aCorner.y * uStrokeWidth * normalA) / uScreen.xy;
        } else {
            currVertexPosition.xy = curr.xy + (aCorner.x * miter * uStrokeWidth * miterLength) / uScreen.xy;
        }

        if (all(equal(nextVertexPosition.xy, curr.xy))) {
            curr.xy = nextVertexPosition.xy + normalize(nextVertexPosition.xy - nextNext.xy);
        }
        if (all(equal(nextVertexPosition.xy, nextNext.xy))) {
            nextNext.xy = nextVertexPosition.xy + normalize(nextVertexPosition.xy - curr.xy);
        }
        vec2 C = normalize(normalize(nextVertexPosition.xy - curr.xy) * uScreen);
        vec2 D = normalize(normalize(nextNext.xy - nextVertexPosition.xy) * uScreen);
        vec2 tangentCD = normalize(C + D);
        vec2 miterCD = vec2(-tangentCD.y, tangentCD.x);
        vec2 normalC = vec2(-C.y, C.x);
        float miterCDLength = 1.0 / dot(miterCD, normalC);
        vec2 pointCD = normalize(C - D);
        if (miterCDLength > 10.0 && sign(aCorner.x * dot(miterCD, pointCD)) > 0.0) {
            nextVertexPosition.xy = nextVertexPosition.xy - (aCorner.x * aCorner.y * uStrokeWidth * normalC) / uScreen.xy;
        } else {
            nextVertexPosition.xy = nextVertexPosition.xy + (aCorner.x * miterCD * uStrokeWidth * miterCDLength) / uScreen.xy;
        }

        gl_Position.xy = ((1.0 - aCorner.z) * currVertexPosition.xy) + (aCorner.z * nextVertexPosition.xy);`
    };
    const errorBar = {
      header: `
        attribute vec3 aCorner;
        attribute float aCrossValue;
        attribute float aBandwidth;
        attribute float aHighValue;
        attribute float aLowValue;
        attribute float aDefined;

        uniform vec2 uScreen;
        uniform float uStrokeWidth;

        varying float vDefined;`,
      body: `
        vDefined = aDefined;
        float isLow = (aCorner.y + 1.0) / 2.0;
        float yValue = isLow * aLowValue + (1.0 - isLow) * aHighValue;

        float isEdgeCorner = abs(aCorner.x);
        float lineWidthXDirection = (1.0 - isEdgeCorner) * aCorner.z;
        float lineWidthYDirection = isEdgeCorner * aCorner.z;

        gl_Position = vec4(aCrossValue, yValue, 0, 1);

        float xModifier = (uStrokeWidth * lineWidthXDirection) + (aBandwidth * aCorner.x / 2.0);
        float yModifier = (uStrokeWidth * lineWidthYDirection);`
    };
    const area = {
      header: `
        attribute vec3 aCorner;
        attribute float aCrossValue;
        attribute float aMainValue;
        attribute float aCrossNextValue;
        attribute float aMainNextValue;
        attribute float aBaseValue;
        attribute float aBaseNextValue;
        attribute float aDefined;
        attribute float aDefinedNext;

        varying float vDefined;

        float when_lt(float a, float b) {
            return max(sign(b - a), 0.0);
        }

        float and(float a, float b) {
            return a * b;
        }`,
      body: `
        vDefined = aDefined * aDefinedNext;
        gl_Position = vec4(0, 0, 0, 1);

        float hasIntercepted = when_lt((aMainNextValue - aBaseNextValue) * (aMainValue - aBaseValue), 0.0);
        float useIntercept = and(aCorner.z, hasIntercepted);

        float yGradient = (aMainNextValue - aMainValue) / (aCrossNextValue - aCrossValue);
        float yConstant = aMainNextValue - (yGradient * aCrossNextValue);

        float y0Gradient = (aBaseNextValue - aBaseValue) / (aCrossNextValue - aCrossValue);
        float y0Constant = aBaseNextValue - (y0Gradient * aCrossNextValue);

        float denominator = (yGradient - y0Gradient) + step(abs(yGradient - y0Gradient), 0.0);
        float interceptXValue = (y0Constant - yConstant) / denominator;
        float interceptYValue = (yGradient * interceptXValue) + yConstant;

        gl_Position = vec4(interceptXValue * useIntercept, interceptYValue * useIntercept, 0, 1);

        gl_Position.x += (1.0 - useIntercept) * ((aCorner.x * aCrossNextValue) + ((1.0 - aCorner.x) * aCrossValue));
        gl_Position.y += (1.0 - useIntercept) * (1.0 - aCorner.y) * ((aCorner.x * aMainNextValue) + ((1.0 - aCorner.x) * aMainValue));
        gl_Position.y += (1.0 - useIntercept) * aCorner.y * ((aCorner.x * aBaseNextValue) + ((1.0 - aCorner.x) * aBaseValue));`
    };
    const boxPlot = {
      header: `
        attribute vec4 aCorner;
        attribute float aCrossValue;
        attribute float aBandwidth;
        attribute float aCapWidth;
        attribute float aHighValue;
        attribute float aUpperQuartileValue;
        attribute float aMedianValue;
        attribute float aLowerQuartileValue;
        attribute float aLowValue;
        attribute float aDefined;

        uniform vec2 uScreen;
        uniform float uStrokeWidth;

        varying float vDefined;
    `,
      body: `
        vDefined = aDefined;
        float isExtremeY = sign(abs(aCorner.y) - 2.0) + 1.0;
        float isNotExtremeY = 1.0 - isExtremeY;

        float isNonZeroY = abs(sign(aCorner.y));
        float isZeroY = 1.0 - isNonZeroY;

        float isQuartileY = isNotExtremeY * isNonZeroY;

        float isPositiveY = (sign(aCorner.y + 0.5) + 1.0) / 2.0;
        float isNegativeY = 1.0 - isPositiveY;

        float yValue =
          (isExtremeY * isNegativeY) * aHighValue +
          (isQuartileY * isNegativeY) * aUpperQuartileValue +
          isZeroY * aMedianValue +
          (isQuartileY * isPositiveY) * aLowerQuartileValue +
          (isExtremeY * isPositiveY) * aLowValue;

        gl_Position = vec4(aCrossValue, yValue, 0, 1);

        float isHorizontal = aCorner.w;
        float isVertical = 1.0 - isHorizontal;

        float xDisplacement = aCorner.x * (isExtremeY * aCapWidth + isNotExtremeY * aBandwidth) / 2.0;

        float xModifier = (isVertical * uStrokeWidth * aCorner.z / 2.0) + xDisplacement;
        float yModifier = isHorizontal * uStrokeWidth * aCorner.z / 2.0;`
    };

    const circle$1 = {
      header: `
        varying float vSize;
        varying float vDefined;`,
      body: `
        float canFill = 1.0;
        float distance = length(2.0 * gl_PointCoord - 1.0);
        float canStroke = smoothstep(vSize - 2.0, vSize, distance * vSize);
        if (distance > 1.0 || vDefined < 0.5) {
            discard;
            return;
        }`
    }; // See https://iquilezles.org/www/articles/distfunctions2d/distfunctions2d.htm.

    const star$1 = {
      header: `
        varying float vSize;
        varying float vDefined;

        // anterior, exterior angles
        float an = 0.628319;
        vec2 acs = vec2(0.809017, 0.587786); // (cos, sin)
        float en = 0.952000;
        vec2 ecs = vec2(0.580055, 0.814577);
    `,
      body: `
        float canFill = 1.0;

        vec2 p = 2.0 * gl_PointCoord - 1.0;
        p.y *= -1.0;

        // sector
        float bn = mod(atan(p.x, p.y), 2.0 * an) - an;
        p = length(p) * vec2(cos(bn), abs(sin(bn)));

        p -= acs;
        p += ecs * clamp(-dot(p, ecs), 0.0, acs.y / ecs.y);
        float d = length(p) * sign(p.x);

        float distance = 1.0 + d;
        float canStroke = smoothstep(vSize - 2.0, vSize, distance * vSize);
        if (distance > 1.0 || vDefined < 0.5) {
            discard;
            return;
        }`
    };
    const wye$1 = {
      header: `
        varying float vSize;
        varying float vDefined;
    `,
      body: `
        float canFill = 1.0;

        vec2 p = 2.0 * gl_PointCoord - 1.0;
        p.y *= -1.0;

        // sector
        float an = 3.141593 / 3.0;
        float bn = mod(atan(p.x, p.y), 2.0 * an) - an;
        p = length(p) * vec2(cos(bn), abs(sin(bn)));

        // box
        vec2 d = abs(p) - vec2(0.9, 0.35);
        float sdf = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);

        float distance = 1.0 + sdf;
        float canStroke = smoothstep(vSize - 2.0, vSize, distance * vSize);
        if (distance > 1.0 || vDefined < 0.5) {
            discard;
            return;
        }`
    };
    const square$1 = {
      header: `
        varying float vSize;
        varying float vDefined;`,
      body: `
        float canFill = 1.0;
        if (vDefined < 0.5) {
            discard;
        }
        vec2 pointCoordTransform = 2.0 * gl_PointCoord - 1.0;
        float distance = max(abs(pointCoordTransform.x), abs(pointCoordTransform.y));
        float canStroke = smoothstep(vSize - 2.0, vSize, distance * vSize);`
    }; // Diamond is symmetrical about the x, and y axes, so only consider x, y > 0.
    // (x, y) are the coordinates of the fragment within the gl point (after
    // transformed to be [-1, 1]).
    // a, b control the width, height of the triangle, so diamond is 2a, 2b.
    // Line L is a ray from the origin through (x, y), the distance function is then
    // the distance to (x, y) divided by the distance to where L intersects with the
    // diamond, this makes the distance function < 1 inside, 1 on the boundary, and
    // > 1 outside the diamond.
    //    |
    // b ---
    //    |\             L
    //    | -\          /
    //    |   \        /
    //    |    \      /
    //    |     -\   /
    //    |       \ /
    // Y ---       X
    //    |       / -\
    //    |      /    \
    //    |     /      \
    // y ---   X        -\
    //    |   /           \
    //    |  /             \
    //    | /               -\
    //    |/                  \
    //    +----|---|-----------|---
    //         x   X           a

    const diamond$1 = {
      header: `
        varying float vSize;
        varying float vDefined;
        float a = 0.6;
        float b = 1.0;
    `,
      body: `
        if (vDefined < 0.5) {
            discard;
        }

        vec2 pointCoordTransform = 2.0 * gl_PointCoord - 1.0;

        float x = abs(pointCoordTransform.x);
        float y = abs(pointCoordTransform.y);

        float X = (a * b * x) / (a * y + b * x);
        float Y = (a * b * y) / (a * y + b * x);

        float distance = length(vec2(x, y)) / length(vec2(X, Y));

        if (distance > 1.0) {
            discard;
        }
    `
    };
    const triangle$1 = {
      header: `
        varying float vSize;
        varying float vDefined;`,
      body: `
        float canFill = 1.0;
        vec2 pointCoordTransform = 2.0 * gl_PointCoord - 1.0;
        float topEdgesDistance = abs(pointCoordTransform.x) - ((pointCoordTransform.y - 0.6) / sqrt(3.0));
        float bottomEdgeDistance = pointCoordTransform.y + 0.5;
        float distance = max(topEdgesDistance, bottomEdgeDistance);
        float canStroke = smoothstep(vSize - 2.0, vSize, distance * vSize);
        if (distance > 1.0 || vDefined < 0.5) {
            discard;
        }`
    };
    const cross$1 = {
      header: `
        varying float vSize;
        varying float vStrokeWidthRatio;
        varying float vDefined;`,
      body: `
        float canFill = 1.0;
        vec2 pointCoordTransform = 2.0 * gl_PointCoord - 1.0;
        float innerCornerDistance = min(abs(pointCoordTransform.x), abs(pointCoordTransform.y)) + 0.66 - vStrokeWidthRatio;
        float outerEdgeDistance = max(abs(pointCoordTransform.x), abs(pointCoordTransform.y));
        float distance = max(innerCornerDistance, outerEdgeDistance);
        float canStroke = smoothstep(vSize - 2.0, vSize, distance * vSize);
        if (distance > 1.0 || vDefined < 0.5) {
            discard;
        }`
    };
    const candlestick$1 = {
      header: `
        varying float vColorIndicator;
        varying float vDefined;`,
      body: `
        float canFill = 1.0;
        float canStroke = 0.0;
        if (vDefined < 0.5) {
            discard;
        }
        gl_FragColor = vec4(0.4, 0.8, 0, 1);
        if (vColorIndicator < 0.0) {
            gl_FragColor = vec4(0.8, 0.4, 0, 1);
        }`
    };
    const ohlc$1 = {
      header: `
        varying float vColorIndicator;
        varying float vDefined;`,
      body: `
        float canFill = 0.0;
        float canStroke = 1.0;
        if (vDefined < 0.5) {
            discard;
        }
        gl_FragColor = vec4(0.4, 0.8, 0, 1);
        if (vColorIndicator < 0.0) {
            gl_FragColor = vec4(0.8, 0.4, 0, 1);
        }`
    };
    const area$1 = {
      header: `
        varying float vDefined;`,
      body: `
        float canFill = 1.0;
        float canStroke = 0.0;
        if (vDefined < 0.5) {
            discard;
        }
        gl_FragColor = vec4(0.86, 0.86, 0.86, 1);`
    };
    const boxPlot$1 = {
      header: `
        varying float vDefined;
    `,
      body: `
        float canFill = 0.0;
        float canStroke = 1.0;

        if (vDefined < 0.5) {
            discard;
        }`
    };
    const errorBar$1 = {
      header: `varying float vDefined;`,
      body: `
        float canFill = 0.0;
        float canStroke = 1.0;
        if (vDefined < 0.5) {
            discard;
        }`
    };
    const bar$1 = {
      header: `varying float vDefined;`,
      body: `
        float canFill = 1.0;
        float canStroke = 0.0;

        gl_FragColor = vec4(0.60, 0.60, 0.60, 1.0);

        if (vDefined < 0.5) {
            discard;
        }`
    };
    const fillColor$1 = {
      header: `varying vec4 vFillColor;`,
      body: `gl_FragColor = (canFill * vFillColor) + ((1.0 - canFill) * gl_FragColor);`
    };
    const strokeColor$1 = {
      header: `varying vec4 vStrokeColor;`,
      body: `gl_FragColor = (canStroke * vStrokeColor) + ((1.0 - canStroke) * gl_FragColor);`
    };
    const line = {
      header: `varying float vDefined;`,
      body: `
        float canFill = 0.0;
        float canStroke = 1.0;
        if (vDefined < 0.5) {
            discard;
        }`
    };

    var areaShader = (() => {
      const vertexShader = shaderBuilder(vertexShaderBase);
      const fragmentShader = shaderBuilder(fragmentShaderBase);
      vertexShader.appendHeader(area.header).appendBody(area.body);
      fragmentShader.appendHeader(area$1.header).appendBody(area$1.body);
      return {
        vertex: () => vertexShader,
        fragment: () => fragmentShader
      };
    });

    const types = {
      BYTE: 5120,
      UNSIGNED_BYTE: 5121,
      SHORT: 5122,
      UNSIGNED_SHORT: 5123,
      FLOAT: 5126
    };
    function length(type) {
      switch (type) {
        case types.BYTE:
        case types.UNSIGNED_BYTE:
          return 1;

        case types.SHORT:
        case types.UNSIGNED_SHORT:
          return 2;

        case types.FLOAT:
          return 4;

        default:
          throw new Error(`Unknown type ${type}`);
      }
    }
    function getArrayViewConstructor(type) {
      switch (type) {
        case types.BYTE:
          return Int8Array;

        case types.UNSIGNED_BYTE:
          return Uint8Array;

        case types.SHORT:
          return Int16Array;

        case types.UNSIGNED_SHORT:
          return Uint16Array;

        case types.FLOAT:
          return Float32Array;

        default:
          throw new Error(`Unknown type ${type}`);
      }
    }

    var baseAttributeBuilder = (() => {
      let location = -1;
      let buffer = null;
      let size = 1; // per vertex

      let type = types.FLOAT;
      let normalized = false;
      let stride = 0;
      let offset = 0;
      let divisor = 0;

      const baseAttribute = programBuilder => {
        const gl = programBuilder.context();

        if (buffer == null) {
          buffer = gl.createBuffer();
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.vertexAttribPointer(location, size, type, normalized, stride, offset);
        gl.enableVertexAttribArray(location);
        const extInstancedArrays = programBuilder.extInstancedArrays();

        if (extInstancedArrays != null) {
          extInstancedArrays.vertexAttribDivisorANGLE(location, divisor);
        }
      };

      baseAttribute.location = (...args) => {
        if (!args.length) {
          return location;
        }

        location = args[0];
        return baseAttribute;
      };

      baseAttribute.buffer = (...args) => {
        if (!args.length) {
          return buffer;
        }

        buffer = args[0];
        return baseAttribute;
      };

      baseAttribute.size = (...args) => {
        if (!args.length) {
          return size;
        }

        size = args[0];
        return baseAttribute;
      };

      baseAttribute.type = (...args) => {
        if (!args.length) {
          return type;
        }

        type = args[0];
        return baseAttribute;
      };

      baseAttribute.normalized = (...args) => {
        if (!args.length) {
          return normalized;
        }

        normalized = args[0];
        return baseAttribute;
      };

      baseAttribute.stride = (...args) => {
        if (!args.length) {
          return stride;
        }

        stride = args[0];
        return baseAttribute;
      };

      baseAttribute.offset = (...args) => {
        if (!args.length) {
          return offset;
        }

        offset = args[0];
        return baseAttribute;
      };

      baseAttribute.divisor = (...args) => {
        if (!args.length) {
          return divisor;
        }

        divisor = args[0];
        return baseAttribute;
      };

      return baseAttribute;
    });

    var defaultArrayViewFactory = (() => {
      let type = types.FLOAT;
      let cachedArray = new Float32Array(0);

      const factory = requiredLength => {
        const ArrayType = getArrayViewConstructor(type);

        if (cachedArray.length > requiredLength) {
          cachedArray = new ArrayType(cachedArray.buffer, 0, requiredLength);
        } else if (cachedArray.length !== requiredLength) {
          cachedArray = new ArrayType(requiredLength);
        }

        return cachedArray;
      };

      factory.type = (...args) => {
        if (!args.length) {
          return type;
        }

        if (type !== args[0]) {
          type = args[0];
          const ArrayType = getArrayViewConstructor(type);
          cachedArray = new ArrayType(0);
        }

        return factory;
      };

      return factory;
    });

    var attributeProjector = (() => {
      let dirty = true;
      let size = 1; // per vertex

      let type = types.FLOAT;
      let arrayViewFactory = defaultArrayViewFactory();

      let value = (d, i) => d;

      let data = null;

      const projector = () => {
        const length = data.length;
        const projectedData = arrayViewFactory.type(type)(length * size);

        if (size > 1) {
          for (let i = 0; i < length; i++) {
            const componentValues = value(data[i], i);

            if (componentValues.length !== size) {
              throw new Error(`Expected components array of size ${size}, recieved array with length ${componentValues.length}.`);
            }

            for (let component = 0; component < size; component++) {
              projectedData[i * size + component] = componentValues[component];
            }
          }
        } else {
          for (let i = 0; i < length; i++) {
            const componentValue = value(data[i], i);

            if (Array.isArray(componentValue)) {
              throw new Error(`Expected a single component value, recieved array with length ${componentValue.length}.`);
            }

            projectedData[i] = componentValue;
          }
        }

        dirty = false;
        return projectedData;
      };

      projector.dirty = () => dirty;

      projector.clear = () => {
        dirty = true;
      };

      projector.size = (...args) => {
        if (!args.length) {
          return size;
        }

        size = args[0];
        dirty = true;
        return projector;
      };

      projector.type = (...args) => {
        if (!args.length) {
          return type;
        }

        type = args[0];
        dirty = true;
        return projector;
      };

      projector.arrayViewFactory = (...args) => {
        if (!args.length) {
          return arrayViewFactory;
        }

        arrayViewFactory = args[0];
        dirty = true;
        return projector;
      };

      projector.value = (...args) => {
        if (!args.length) {
          return value;
        }

        value = args[0];
        dirty = true;
        return projector;
      };

      projector.data = (...args) => {
        if (!args.length) {
          return data;
        }

        data = args[0];
        dirty = true;
        return projector;
      };

      return projector;
    });

    var vertexAttribute = (() => {
      const base = baseAttributeBuilder();
      const projector = attributeProjector();

      const vertexAttribute = programBuilder => {
        base.size(vertexAttribute.size()).type(vertexAttribute.type());
        base(programBuilder);

        if (!projector.dirty()) {
          return;
        }

        const projectedData = projector();
        const gl = programBuilder.context();
        gl.bindBuffer(gl.ARRAY_BUFFER, base.buffer());
        gl.bufferData(gl.ARRAY_BUFFER, projectedData, gl.DYNAMIC_DRAW);
      };

      vertexAttribute.clear = () => {
        base.buffer(null);
        projector.clear();
      };

      rebind(vertexAttribute, base, 'normalized', 'location');
      rebind(vertexAttribute, projector, 'data', 'value', 'size', 'type');
      return vertexAttribute;
    });

    var elementIndices = (initialData => {
      let buffer = null;
      let data = initialData;
      let dirty = true;

      const base = programBuilder => {
        const gl = programBuilder.context();

        if (buffer == null) {
          buffer = gl.createBuffer();
        }

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer);

        if (!dirty) {
          return;
        }

        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(data), gl.STATIC_DRAW);
        dirty = false;
      };

      base.clear = () => {
        buffer = null;
        dirty = true;
      };

      base.data = (...args) => {
        if (!args.length) {
          return data;
        }

        dirty = true;
        data = args[0];
        return base;
      };

      return base;
    });

    var rebindCurry = ((target, targetName, source, sourceName, ...curriedArgs) => {
      target[targetName] = (...args) => {
        const result = source[sourceName](...curriedArgs, ...args);

        if (result === source) {
          return target;
        }

        return result;
      };
    });

    var webglSeriesArea = (() => {
      const program = programBuilder().mode(drawModes.TRIANGLES);
      let xScale = baseScale();
      let yScale = baseScale();

      let decorate = () => {};

      const cornerAttribute = vertexAttribute().size(3).type(types.UNSIGNED_BYTE).data([[0, 0, 0], [0, 1, 0], [1, 1, 1], [0, 0, 1], [1, 0, 0], [1, 1, 0]]);
      program.buffers().elementIndices(elementIndices([0, 1, 2, 3, 4, 5])).attribute('aCorner', cornerAttribute);

      const draw = numElements => {
        const shaderBuilder = areaShader();
        program.vertexShader(shaderBuilder.vertex()).fragmentShader(shaderBuilder.fragment());
        xScale(program, 'gl_Position', 0);
        yScale(program, 'gl_Position', 1);
        decorate(program);
        program(numElements - 1);
      };

      draw.decorate = (...args) => {
        if (!args.length) {
          return decorate;
        }

        decorate = args[0];
        return draw;
      };

      draw.xScale = (...args) => {
        if (!args.length) {
          return xScale;
        }

        xScale = args[0];
        return draw;
      };

      draw.yScale = (...args) => {
        if (!args.length) {
          return yScale;
        }

        yScale = args[0];
        return draw;
      };

      rebind(draw, program, 'context');
      rebindCurry(draw, 'crossValueAttribute', program.buffers(), 'attribute', 'aCrossValue');
      rebindCurry(draw, 'crossNextValueAttribute', program.buffers(), 'attribute', 'aCrossNextValue');
      rebindCurry(draw, 'mainValueAttribute', program.buffers(), 'attribute', 'aMainValue');
      rebindCurry(draw, 'mainNextValueAttribute', program.buffers(), 'attribute', 'aMainNextValue');
      rebindCurry(draw, 'baseValueAttribute', program.buffers(), 'attribute', 'aBaseValue');
      rebindCurry(draw, 'baseNextValueAttribute', program.buffers(), 'attribute', 'aBaseNextValue');
      rebindCurry(draw, 'definedAttribute', program.buffers(), 'attribute', 'aDefined');
      rebindCurry(draw, 'definedNextAttribute', program.buffers(), 'attribute', 'aDefinedNext');
      return draw;
    });

    var circlePointShader = (() => {
      const vertexShader = shaderBuilder(vertexShaderBase);
      const fragmentShader = shaderBuilder(fragmentShaderBase);
      vertexShader.appendHeader(circle.header).appendBody(circle.body);
      fragmentShader.appendHeader(circle$1.header).appendBody(circle$1.body);
      return {
        vertex: () => vertexShader,
        fragment: () => fragmentShader
      };
    });

    var webglSeriesPoint = (() => {
      const program = programBuilder().mode(drawModes.POINTS);
      let xScale = baseScale();
      let yScale = baseScale();
      let type = circlePointShader();

      let decorate = () => {};

      const draw = numElements => {
        program.vertexShader(type.vertex()).fragmentShader(type.fragment());
        xScale(program, 'gl_Position', 0);
        yScale(program, 'gl_Position', 1);
        decorate(program);
        program(numElements);
      };

      draw.type = (...args) => {
        if (!args.length) {
          return type;
        }

        type = args[0];
        return draw;
      };

      draw.decorate = (...args) => {
        if (!args.length) {
          return decorate;
        }

        decorate = args[0];
        return draw;
      };

      draw.xScale = (...args) => {
        if (!args.length) {
          return xScale;
        }

        xScale = args[0];
        return draw;
      };

      draw.yScale = (...args) => {
        if (!args.length) {
          return yScale;
        }

        yScale = args[0];
        return draw;
      };

      rebind(draw, program, 'context');
      rebindCurry(draw, 'crossValueAttribute', program.buffers(), 'attribute', 'aCrossValue');
      rebindCurry(draw, 'mainValueAttribute', program.buffers(), 'attribute', 'aMainValue');
      rebindCurry(draw, 'sizeAttribute', program.buffers(), 'attribute', 'aSize');
      rebindCurry(draw, 'definedAttribute', program.buffers(), 'attribute', 'aDefined');
      return draw;
    });

    var lineShader = (() => {
      const vertexShader = shaderBuilder(vertexShaderBase);
      const fragmentShader = shaderBuilder(fragmentShaderBase);
      vertexShader.appendHeader(preScaleLine.header).appendBody(preScaleLine.body);
      fragmentShader.appendHeader(line.header).appendBody(line.body);
      return {
        vertex: () => vertexShader,
        fragment: () => fragmentShader
      };
    });

    var lineWidthShader = (() => {
      let width = 1;

      const lineWidth = program => {
        program.buffers().uniform('uStrokeWidth', uniform(width));
      };

      lineWidth.lineWidth = (...args) => {
        if (!args.length) {
          return width;
        }

        width = args[0];
        return lineWidth;
      };

      return lineWidth;
    });

    var webglSeriesLine = (() => {
      const program = programBuilder().mode(drawModes.TRIANGLES);
      let xScale = baseScale();
      let yScale = baseScale();

      let decorate = () => {};

      const lineWidth = lineWidthShader();
      const cornerAttribute = vertexAttribute().size(3).type(types.BYTE).data([[-1, 0, 0], [1, 1, 0], [1, -1, 1], [-1, 0, 1], [1, 1, 1]]);
      program.buffers().elementIndices(elementIndices([0, 1, 2, 1, 2, 3, 0, 2, 3, 2, 3, 4])).attribute('aCorner', cornerAttribute);

      const draw = numElements => {
        const shaderBuilder = lineShader();
        program.vertexShader(shaderBuilder.vertex()).fragmentShader(shaderBuilder.fragment());
        xScale(program, 'prev', 0);
        yScale(program, 'prev', 1);
        xScale(program, 'curr', 0);
        yScale(program, 'curr', 1);
        xScale(program, 'gl_Position', 0);
        yScale(program, 'gl_Position', 1);
        xScale(program, 'nextNext', 0);
        yScale(program, 'nextNext', 1);
        program.vertexShader().appendBody(postScaleLine.body);
        lineWidth(program);
        decorate(program);
        program(numElements - 1);
      };

      draw.decorate = (...args) => {
        if (!args.length) {
          return decorate;
        }

        decorate = args[0];
        return draw;
      };

      draw.xScale = (...args) => {
        if (!args.length) {
          return xScale;
        }

        xScale = args[0];
        return draw;
      };

      draw.yScale = (...args) => {
        if (!args.length) {
          return yScale;
        }

        yScale = args[0];
        return draw;
      };

      rebind(draw, program, 'context');
      rebind(draw, lineWidth, 'lineWidth');
      rebindCurry(draw, 'crossPreviousValueAttribute', program.buffers(), 'attribute', 'aCrossPrevValue');
      rebindCurry(draw, 'crossValueAttribute', program.buffers(), 'attribute', 'aCrossValue');
      rebindCurry(draw, 'crossNextValueAttribute', program.buffers(), 'attribute', 'aCrossNextValue');
      rebindCurry(draw, 'crossNextNextValueAttribute', program.buffers(), 'attribute', 'aCrossNextNextValue');
      rebindCurry(draw, 'mainPreviousValueAttribute', program.buffers(), 'attribute', 'aMainPrevValue');
      rebindCurry(draw, 'mainValueAttribute', program.buffers(), 'attribute', 'aMainValue');
      rebindCurry(draw, 'mainNextValueAttribute', program.buffers(), 'attribute', 'aMainNextValue');
      rebindCurry(draw, 'mainNextNextValueAttribute', program.buffers(), 'attribute', 'aMainNextNextValue');
      rebindCurry(draw, 'definedAttribute', program.buffers(), 'attribute', 'aDefined');
      rebindCurry(draw, 'definedNextAttribute', program.buffers(), 'attribute', 'aDefinedNext');
      return draw;
    });

    var ohlcShader = (() => {
      const vertexShader = shaderBuilder(vertexShaderBase);
      const fragmentShader = shaderBuilder(fragmentShaderBase);
      vertexShader.appendHeader(ohlc.header).appendBody(ohlc.body);
      fragmentShader.appendHeader(ohlc$1.header).appendBody(ohlc$1.body);
      return {
        vertex: () => vertexShader,
        fragment: () => fragmentShader
      };
    });

    var webglSeriesOhlc = (() => {
      const program = programBuilder().mode(drawModes.TRIANGLES);
      let xScale = baseScale();
      let yScale = baseScale();
      const lineWidth = lineWidthShader();

      let decorate = () => {};
      /*
       * x-y coordinate to locate the "corners" of the element.
       * X: -1: LEFT, 0: MIDDLE, 1: RIGHT
       * Y: -2: HIGH, -1: OPEN, 1: CLOSE, 2: LOW
       * Z - Follows convention for X/Y (appropriate direction will be selected by the shader): -1: LEFT/TOP, 1: RIGHT/BOTTOM
       */


      const cornerAttribute = vertexAttribute().size(3).type(types.BYTE).data([// Main stem
      [0, -2, -1], [0, -2, 1], [0, 2, 1], [0, 2, -1], // Open bar
      [-1, -1, -1], [-1, -1, 1], [0, -1, 1], [0, -1, -1], // Close bar
      [1, 1, 1], [0, 1, 1], [0, 1, -1], [1, 1, -1]]);
      program.buffers().elementIndices(elementIndices([// Main stem
      0, 1, 2, 0, 3, 2, // Open bar
      4, 5, 6, 4, 7, 6, // Close bar
      8, 9, 10, 10, 11, 8])).attribute('aCorner', cornerAttribute);

      const draw = numElements => {
        const shaderBuilder = ohlcShader();
        program.vertexShader(shaderBuilder.vertex()).fragmentShader(shaderBuilder.fragment());
        xScale(program, 'gl_Position', 0);
        yScale(program, 'gl_Position', 1);
        lineWidth(program);
        program.vertexShader().appendBody(`
          gl_Position.x += xModifier / uScreen.x;
          gl_Position.y += yModifier / uScreen.y;
        `);
        decorate(program);
        program(numElements);
      };

      draw.decorate = (...args) => {
        if (!args.length) {
          return decorate;
        }

        decorate = args[0];
        return draw;
      };

      draw.xScale = (...args) => {
        if (!args.length) {
          return xScale;
        }

        xScale = args[0];
        return draw;
      };

      draw.yScale = (...args) => {
        if (!args.length) {
          return yScale;
        }

        yScale = args[0];
        return draw;
      };

      rebind(draw, program, 'context');
      rebind(draw, lineWidth, 'lineWidth');
      rebindCurry(draw, 'crossValueAttribute', program.buffers(), 'attribute', 'aCrossValue');
      rebindCurry(draw, 'openValueAttribute', program.buffers(), 'attribute', 'aOpenValue');
      rebindCurry(draw, 'highValueAttribute', program.buffers(), 'attribute', 'aHighValue');
      rebindCurry(draw, 'lowValueAttribute', program.buffers(), 'attribute', 'aLowValue');
      rebindCurry(draw, 'closeValueAttribute', program.buffers(), 'attribute', 'aCloseValue');
      rebindCurry(draw, 'bandwidthAttribute', program.buffers(), 'attribute', 'aBandwidth');
      rebindCurry(draw, 'definedAttribute', program.buffers(), 'attribute', 'aDefined');
      return draw;
    });

    var barShader = (() => {
      const vertexShader = shaderBuilder(vertexShaderBase);
      const fragmentShader = shaderBuilder(fragmentShaderBase);
      vertexShader.appendHeader(bar.header).appendBody(bar.body);
      fragmentShader.appendHeader(bar$1.header).appendBody(bar$1.body);
      return {
        vertex: () => vertexShader,
        fragment: () => fragmentShader
      };
    });

    //     .-------------.------------.
    // (x-w/2, y1)    (x, y1)   (x+w/2, y1)
    //     |     \                    |
    //     |        \                 |
    //     |           \              |
    //     |              \           |
    //     |                 \        |
    //     |                    \     |
    //     |                       \  |
    //     αL            α            αR
    //     .-------------.------------.
    // (x-w/2, y0)     (x, y0)   (x+w/2, y0)
    // Drawing order
    // Triangle βL, αL, αR. (bottom)
    // β -> βL.
    // α -> αL.
    // α -> αR.
    // Triangle βL, αR, βR. (top)
    // β -> βL.
    // α -> αR.
    // β -> βR.

    var webglSeriesBar = (() => {
      const program = programBuilder().mode(drawModes.TRIANGLES);
      let xScale = baseScale();
      let yScale = baseScale();

      let decorate = () => {};

      const cornerAttribute = vertexAttribute().size(2).type(types.BYTE).data([[-1, -1], [1, 1], [-1, 1], [1, -1]]);
      program.buffers().elementIndices(elementIndices([0, 1, 2, 0, 1, 3])).attribute('aCorner', cornerAttribute);

      const draw = numElements => {
        const shaderBuilder = barShader();
        program.vertexShader(shaderBuilder.vertex()).fragmentShader(shaderBuilder.fragment());
        xScale(program, 'gl_Position', 0);
        yScale(program, 'gl_Position', 1);
        program.vertexShader().appendBody(`
            gl_Position.x += xModifier / uScreen.x * 2.0;
        `);
        decorate(program);
        program(numElements);
      };

      draw.decorate = (...args) => {
        if (!args.length) {
          return decorate;
        }

        decorate = args[0];
        return draw;
      };

      draw.xScale = (...args) => {
        if (!args.length) {
          return xScale;
        }

        xScale = args[0];
        return draw;
      };

      draw.yScale = (...args) => {
        if (!args.length) {
          return yScale;
        }

        yScale = args[0];
        return draw;
      };

      rebind(draw, program, 'context');
      rebindCurry(draw, 'crossValueAttribute', program.buffers(), 'attribute', 'aCrossValue');
      rebindCurry(draw, 'mainValueAttribute', program.buffers(), 'attribute', 'aMainValue');
      rebindCurry(draw, 'baseValueAttribute', program.buffers(), 'attribute', 'aBaseValue');
      rebindCurry(draw, 'bandwidthAttribute', program.buffers(), 'attribute', 'aBandwidth');
      rebindCurry(draw, 'definedAttribute', program.buffers(), 'attribute', 'aDefined');
      return draw;
    });

    var errorBarShader = (() => {
      const vertexShader = shaderBuilder(vertexShaderBase);
      const fragmentShader = shaderBuilder(fragmentShaderBase);
      vertexShader.appendHeader(errorBar.header).appendBody(errorBar.body);
      fragmentShader.appendHeader(errorBar$1.header).appendBody(errorBar$1.body);
      return {
        vertex: () => vertexShader,
        fragment: () => fragmentShader
      };
    });

    var webglSeriesErrorBar = (() => {
      const program = programBuilder().mode(drawModes.TRIANGLES);
      let xScale = baseScale();
      let yScale = baseScale();

      let decorate = () => {};

      const lineWidth = lineWidthShader();
      /*
       * x-y coordinate to locate the "corners" of the element (ie errorbar). The `z` coordinate locates the corner relative to the line (this takes line width into account).
       * X: -1: LEFT, 0: MIDDLE, 1: RIGHT
       * Y: -1: HIGH, 1: LOW
       * Z: Follows X or Y convention, depending on the orientation of the line that the vertex is part of.
       */

      const cornerAttribute = vertexAttribute().size(3).type(types.BYTE).data([// Main stem
      [0, 1, 1], [0, 1, -1], [0, -1, -1], [0, -1, 1], // Top cap
      [1, -1, 1], [1, -1, -1], [-1, -1, -1], [-1, -1, 1], // Bottom cap
      [-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]]);
      program.buffers().elementIndices(elementIndices([// Main stem
      0, 1, 2, 0, 3, 2, // Top cap
      4, 5, 6, 4, 7, 6, // Bottom cap
      8, 9, 10, 8, 11, 10])).attribute('aCorner', cornerAttribute);

      const draw = numElements => {
        const shaderBuilder = errorBarShader();
        program.vertexShader(shaderBuilder.vertex()).fragmentShader(shaderBuilder.fragment());
        xScale(program, 'gl_Position', 0);
        yScale(program, 'gl_Position', 1);
        lineWidth(program);
        program.vertexShader().appendBody(`
                gl_Position.x += xModifier / uScreen.x * 2.0;
                gl_Position.y += yModifier / uScreen.y * 2.0;
            `);
        decorate(program);
        program(numElements);
      };

      draw.decorate = (...args) => {
        if (!args.length) {
          return decorate;
        }

        decorate = args[0];
        return draw;
      };

      draw.xScale = (...args) => {
        if (!args.length) {
          return xScale;
        }

        xScale = args[0];
        return draw;
      };

      draw.yScale = (...args) => {
        if (!args.length) {
          return yScale;
        }

        yScale = args[0];
        return draw;
      };

      rebind(draw, program, 'context');
      rebind(draw, lineWidth, 'lineWidth');
      rebindCurry(draw, 'crossValueAttribute', program.buffers(), 'attribute', 'aCrossValue');
      rebindCurry(draw, 'highValueAttribute', program.buffers(), 'attribute', 'aHighValue');
      rebindCurry(draw, 'lowValueAttribute', program.buffers(), 'attribute', 'aLowValue');
      rebindCurry(draw, 'bandwidthAttribute', program.buffers(), 'attribute', 'aBandwidth');
      rebindCurry(draw, 'definedAttribute', program.buffers(), 'attribute', 'aDefined');
      return draw;
    });

    var candlestickShader = (() => {
      const vertexShader = shaderBuilder(vertexShaderBase);
      const fragmentShader = shaderBuilder(fragmentShaderBase);
      vertexShader.appendHeader(candlestick.header).appendBody(candlestick.body);
      fragmentShader.appendHeader(candlestick$1.header).appendBody(candlestick$1.body);
      return {
        vertex: () => vertexShader,
        fragment: () => fragmentShader
      };
    });

    var webglSeriesCandlestick = (() => {
      const program = programBuilder().mode(drawModes.TRIANGLES);
      let xScale = baseScale();
      let yScale = baseScale();
      const lineWidth = lineWidthShader();

      let decorate = () => {};
      /*
       * x-y coordinate to locate the "corners" of the element.
       * X: -1: LEFT, 0: MIDDLE, 1: RIGHT
       * Y: -2: HIGH, -1: OPEN, 1: CLOSE, 2: LOW
       * Z: -1: LEFT, 1: RIGHT (only valid for HIGH/LOW corners)
       */


      const cornerAttribute = vertexAttribute().size(3).type(types.BYTE).data([// Vertical line
      [0, 2, 1], [0, 2, -1], [0, -2, -1], [0, -2, 1], // Central box
      [1, -1, 0], [-1, -1, 0], [-1, 1, 0], [1, 1, 0]]);
      program.buffers().elementIndices(elementIndices([// Vertical line
      0, 1, 2, 0, 3, 2, // Central box
      4, 5, 6, 4, 7, 6])).attribute('aCorner', cornerAttribute);

      const draw = numElements => {
        const shaderBuilder = candlestickShader();
        program.vertexShader(shaderBuilder.vertex()).fragmentShader(shaderBuilder.fragment());
        xScale(program, 'gl_Position', 0);
        yScale(program, 'gl_Position', 1);
        lineWidth(program);
        program.vertexShader().appendBody(`
          gl_Position.x += xModifier / uScreen.x;
          gl_Position.y += yModifier / uScreen.y;
        `);
        decorate(program);
        program(numElements);
      };

      draw.decorate = (...args) => {
        if (!args.length) {
          return decorate;
        }

        decorate = args[0];
        return draw;
      };

      draw.xScale = (...args) => {
        if (!args.length) {
          return xScale;
        }

        xScale = args[0];
        return draw;
      };

      draw.yScale = (...args) => {
        if (!args.length) {
          return yScale;
        }

        yScale = args[0];
        return draw;
      };

      rebind(draw, program, 'context');
      rebind(draw, lineWidth, 'lineWidth');
      rebindCurry(draw, 'crossValueAttribute', program.buffers(), 'attribute', 'aCrossValue');
      rebindCurry(draw, 'openValueAttribute', program.buffers(), 'attribute', 'aOpenValue');
      rebindCurry(draw, 'highValueAttribute', program.buffers(), 'attribute', 'aHighValue');
      rebindCurry(draw, 'lowValueAttribute', program.buffers(), 'attribute', 'aLowValue');
      rebindCurry(draw, 'closeValueAttribute', program.buffers(), 'attribute', 'aCloseValue');
      rebindCurry(draw, 'bandwidthAttribute', program.buffers(), 'attribute', 'aBandwidth');
      rebindCurry(draw, 'definedAttribute', program.buffers(), 'attribute', 'aDefined');
      return draw;
    });

    var boxPlotShader = (() => {
      const vertexShader = shaderBuilder(vertexShaderBase);
      const fragmentShader = shaderBuilder(fragmentShaderBase);
      vertexShader.appendHeader(boxPlot.header).appendBody(boxPlot.body);
      fragmentShader.appendHeader(boxPlot$1.header).appendBody(boxPlot$1.body);
      return {
        vertex: () => vertexShader,
        fragment: () => fragmentShader
      };
    });

    //            .------.------.
    //                   |
    //                   |
    //                   |
    //    βL2            β           βR2
    //     .-------------.------------.
    //     |                          |
    //     |                          |
    //     |                          |
    //     γL2            γ           γR2
    //     .-------------.------------.
    //     |                          |
    //     |                          |
    //     |                          |
    //    δL2            δ           δR2
    //     .-------------.------------.
    //                   |
    //                   |
    //                   |
    //           εL1     ε     εR1
    //            .------.------.
    // Line drawing order
    // αL1 -> αR1
    // α -> β
    // βL2 -> βR2
    // γL2 -> γR2
    // δL2 -> δR2
    // βL2 -> δL2
    // βR2 -> δR2
    // δ -> ε
    // εL1 -> εR1

    var webglSeriesBoxPlot = (() => {
      const program = programBuilder().mode(drawModes.TRIANGLES);
      let xScale = baseScale();
      let yScale = baseScale();

      let decorate = () => {};

      const lineWidth = lineWidthShader();
      /*
       * x-y coordinate to locate the "corners" of the element (ie errorbar). The `z` coordinate locates the corner relative to the line (this takes line width into account).
       * X: -1: LEFT, 0: MIDDLE, 1: RIGHT
       * Y: -2: HIGH, -1: UPPER QUARTILE, 0: MEDIAN, 1: LOWER QUARTILE, 2: LOW
       * Z: Follows X or Y convention, depending on the orientation of the line that the vertex is part of.
       * W: Indicator to determine line orientation (needed because some corners are part of two lines). - 0: VERTICAL, 1: HORIZONTAL
       */

      const cornerAttribute = vertexAttribute().size(4).type(types.BYTE).data([// Top cap line
      [-1, -2, -1, 1], [1, -2, -1, 1], [1, -2, 1, 1], [-1, -2, 1, 1], // Top whisker line
      [0, -2, -1, 0], [0, -2, 1, 0], [0, -1, 1, 0], [0, -1, -1, 0], // Upper quartile line
      [-1, -1, -1, 1], [1, -1, -1, 1], [1, -1, 1, 1], [-1, -1, 1, 1], // Median line
      [-1, 0, -1, 1], [1, 0, -1, 1], [1, 0, 1, 1], [-1, 0, 1, 1], // Lower quartile line
      [-1, 1, -1, 1], [1, 1, -1, 1], [1, 1, 1, 1], [-1, 1, 1, 1], // Left box vertical line
      [-1, -1, -1, 0], [-1, -1, 1, 0], [-1, 1, 1, 0], [-1, 1, -1, 0], // Right box vertical line
      [1, -1, -1, 0], [1, -1, 1, 0], [1, 1, 1, 0], [1, 1, -1, 0], // Bottom whisker line
      [0, 2, -1, 0], [0, 2, 1, 0], [0, 1, 1, 0], [0, 1, -1, 0], // Bottom cap line
      [-1, 2, -1, 1], [1, 2, -1, 1], [1, 2, 1, 1], [-1, 2, 1, 1]]);
      program.buffers().elementIndices(elementIndices([// Top cap line
      0, 1, 2, 0, 2, 3, // Top whisker line
      4, 5, 6, 4, 6, 7, // Upper quartile line
      8, 9, 10, 8, 10, 11, // Median line
      12, 13, 14, 12, 14, 15, // Lower quartile line
      16, 17, 18, 16, 18, 19, // Left box vertical line
      20, 21, 22, 20, 22, 23, // Right box vertical line
      24, 25, 26, 24, 26, 27, // Bottom whisker line
      28, 29, 30, 28, 30, 31, // Bottom cap line
      32, 33, 34, 32, 34, 35])).attribute('aCorner', cornerAttribute);

      const draw = numElements => {
        const shaderBuilder = boxPlotShader();
        program.vertexShader(shaderBuilder.vertex()).fragmentShader(shaderBuilder.fragment());
        xScale(program, 'gl_Position', 0);
        yScale(program, 'gl_Position', 1);
        lineWidth(program);
        program.vertexShader().appendBody(`
            gl_Position.x += xModifier / uScreen.x * 2.0;
            gl_Position.y += yModifier / uScreen.y * 2.0;
        `);
        decorate(program);
        program(numElements);
      };

      draw.decorate = (...args) => {
        if (!args.length) {
          return decorate;
        }

        decorate = args[0];
        return draw;
      };

      draw.xScale = (...args) => {
        if (!args.length) {
          return xScale;
        }

        xScale = args[0];
        return draw;
      };

      draw.yScale = (...args) => {
        if (!args.length) {
          return yScale;
        }

        yScale = args[0];
        return draw;
      };

      rebind(draw, program, 'context');
      rebind(draw, lineWidth, 'lineWidth');
      rebindCurry(draw, 'crossValueAttribute', program.buffers(), 'attribute', 'aCrossValue');
      rebindCurry(draw, 'highValueAttribute', program.buffers(), 'attribute', 'aHighValue');
      rebindCurry(draw, 'upperQuartileValueAttribute', program.buffers(), 'attribute', 'aUpperQuartileValue');
      rebindCurry(draw, 'medianValueAttribute', program.buffers(), 'attribute', 'aMedianValue');
      rebindCurry(draw, 'lowerQuartileValueAttribute', program.buffers(), 'attribute', 'aLowerQuartileValue');
      rebindCurry(draw, 'lowValueAttribute', program.buffers(), 'attribute', 'aLowValue');
      rebindCurry(draw, 'bandwidthAttribute', program.buffers(), 'attribute', 'aBandwidth');
      rebindCurry(draw, 'capAttribute', program.buffers(), 'attribute', 'aCapWidth');
      rebindCurry(draw, 'definedAttribute', program.buffers(), 'attribute', 'aDefined');
      return draw;
    });

    var webglAdjacentElementAttribute = ((minOffset = 0, maxOffset = 0) => {
      if (minOffset > 0 || maxOffset < 0) {
        throw new Error(`Offset values (${minOffset} & ${maxOffset}) must straddle 0 `);
      }

      const base = baseAttributeBuilder().divisor(1);
      const projector = attributeProjector();

      const adjacentAttribute = programBuilder => {
        const elementSize = adjacentAttribute.size() * length(adjacentAttribute.type());
        const bufferOffset = Math.abs(minOffset) * elementSize;
        base.offset(bufferOffset).size(adjacentAttribute.size()).type(adjacentAttribute.type());
        base(programBuilder);

        if (!projector.dirty()) {
          return;
        }

        const projectedData = projector();
        const bufferPadding = maxOffset * elementSize;
        const bufferLength = bufferOffset + projectedData.length * length(adjacentAttribute.type()) + bufferPadding;
        const gl = programBuilder.context();
        gl.bindBuffer(gl.ARRAY_BUFFER, base.buffer());
        gl.bufferData(gl.ARRAY_BUFFER, bufferLength, gl.DYNAMIC_DRAW);
        gl.bufferSubData(gl.ARRAY_BUFFER, bufferOffset, projectedData);
      };

      adjacentAttribute.offset = offset => {
        if (minOffset > offset || offset > maxOffset) {
          throw new Error(`Requested offset ${offset} exceeds bounds (${minOffset} & ${maxOffset}) `);
        }

        const offsetAttribute = programBuilder => {
          base.offset((offset - minOffset) * adjacentAttribute.size() * length(adjacentAttribute.type()));
          base(programBuilder);
        };

        rebind(offsetAttribute, base, 'location');
        rebind(offsetAttribute, adjacentAttribute, 'clear');
        return offsetAttribute;
      };

      adjacentAttribute.clear = () => {
        base.buffer(null);
        projector.clear();
      };

      rebind(adjacentAttribute, base, 'normalized', 'location');
      rebind(adjacentAttribute, projector, 'data', 'value', 'size', 'type');
      return adjacentAttribute;
    });

    var webglElementAttribute = (() => {
      const base = baseAttributeBuilder().divisor(1);
      const projector = attributeProjector();

      const elementAttribute = programBuilder => {
        base.size(elementAttribute.size()).type(elementAttribute.type());
        base(programBuilder);

        if (!projector.dirty()) {
          return;
        }

        const projectedData = projector();
        const gl = programBuilder.context();
        gl.bindBuffer(gl.ARRAY_BUFFER, base.buffer());
        gl.bufferData(gl.ARRAY_BUFFER, projectedData, gl.DYNAMIC_DRAW);
      };

      elementAttribute.clear = () => {
        base.buffer(null);
        projector.clear();
      };

      rebind(elementAttribute, base, 'normalized', 'location');
      rebind(elementAttribute, projector, 'data', 'value', 'size', 'type');
      return elementAttribute;
    });

    var linear = (() => {
      const base = baseScale();

      const prefix = component => `linear${component}`;

      const scale = (programBuilder, identifier, component) => {
        programBuilder.vertexShader().appendHeaderIfNotExists(`uniform vec4 ${prefix(component)}Offset;`).appendHeaderIfNotExists(`uniform vec4 ${prefix(component)}Scale;`).appendBody(`${identifier} = ${identifier} + ${prefix(component)}Offset;`).appendBody(`${identifier} = ${identifier} * ${prefix(component)}Scale;`);
        const domainSize = base.domain()[1] - base.domain()[0];
        const rangeSize = base.range()[1] - base.range()[0];
        const translate = base.range()[0] * (domainSize / rangeSize) - base.domain()[0];
        const scaleFactor = rangeSize / domainSize;
        const offset = [0, 0, 0, 0];
        const scale = [1, 1, 1, 1];
        offset[component] = translate;
        scale[component] = scaleFactor;
        programBuilder.buffers().uniform(`${prefix(component)}Offset`, uniform(offset)).uniform(`${prefix(component)}Scale`, uniform(scale));
      };

      rebindAll(scale, base);
      return scale;
    });

    var log = (() => {
      const glBase = baseScale();
      let base = 10;

      function log(v, base) {
        return Math.log10(v) / Math.log10(base);
      }

      const prefix = component => `log${component}`;

      const scale = (programBuilder, identifier, component) => {
        const logPart = `${prefix(component)}Offset + (${prefix(component)}Scale * clamp(log(${identifier}) / log(${prefix(component)}Base), -inf, inf))`;
        programBuilder.vertexShader().appendHeaderIfNotExists(`uniform vec4 ${prefix(component)}Offset;`).appendHeaderIfNotExists(`uniform vec4 ${prefix(component)}Scale;`).appendHeaderIfNotExists(`uniform vec4 ${prefix(component)}Include;`).appendHeaderIfNotExists(`uniform float ${prefix(component)}Base;`).appendBody(`${identifier} = (${prefix(component)}Include * (${logPart})) + ((1.0 - ${prefix(component)}Include) * ${identifier});`);
        const domainSize = log(glBase.domain()[1], base) - log(glBase.domain()[0], base);
        const rangeSize = glBase.range()[1] - glBase.range()[0];
        const scaleFactor = rangeSize / domainSize;
        const translate = glBase.range()[0] - scaleFactor * log(glBase.domain()[0], base);
        const offset = [0, 0, 0, 0];
        const scale = [0, 0, 0, 0];
        const include = [0, 0, 0, 0];
        offset[component] = translate;
        scale[component] = scaleFactor;
        include[component] = 1;
        programBuilder.buffers().uniform(`${prefix(component)}Offset`, uniform(offset)).uniform(`${prefix(component)}Scale`, uniform(scale)).uniform(`${prefix(component)}Include`, uniform(include)).uniform(`${prefix(component)}Base`, uniform(base));
      };

      scale.base = (...args) => {
        if (!args.length) {
          return base;
        }

        base = args[0];
        return scale;
      };

      rebindAll(scale, glBase);
      return scale;
    });

    var pow = (() => {
      const base = baseScale();
      let exponent = 1;

      function pow(b, e) {
        return Math.sign(b) * Math.pow(Math.abs(b), e);
      }

      const prefix = component => `pow${component}`;

      const scale = (programBuilder, identifier, component) => {
        const powPart = `${prefix(component)}Offset + (${prefix(component)}Scale * sign(${identifier}) * pow(abs(${identifier}), vec4(${prefix(component)}Exp)))`;
        programBuilder.vertexShader().appendHeaderIfNotExists(`uniform vec4 ${prefix(component)}Offset;`).appendHeaderIfNotExists(`uniform vec4 ${prefix(component)}Scale;`).appendHeaderIfNotExists(`uniform vec4 ${prefix(component)}Include;`).appendHeaderIfNotExists(`uniform float ${prefix(component)}Exp;`).appendBody(`${identifier} = (${prefix(component)}Include * (${powPart})) + ((1.0 - ${prefix(component)}Include) * ${identifier});`);
        const domainSize = pow(base.domain()[1], exponent) - pow(base.domain()[0], exponent);
        const rangeSize = base.range()[1] - base.range()[0];
        const scaleFactor = rangeSize / domainSize;
        const translate = base.range()[0] - scaleFactor * pow(base.domain()[0], exponent);
        const offset = [0, 0, 0, 0];
        const scale = [0, 0, 0, 0];
        const include = [0, 0, 0, 0];
        offset[component] = translate;
        scale[component] = scaleFactor;
        include[component] = 1;
        programBuilder.buffers().uniform(`${prefix(component)}Offset`, uniform(offset)).uniform(`${prefix(component)}Scale`, uniform(scale)).uniform(`${prefix(component)}Include`, uniform(include)).uniform(`${prefix(component)}Exp`, uniform(exponent));
      };

      scale.exponent = (...args) => {
        if (!args.length) {
          return exponent;
        }

        exponent = args[0];
        return scale;
      };

      rebindAll(scale, base);
      return scale;
    });

    // determine the scale type.

    const scaleLinearCopy = d3Scale.scaleLinear().copy.toString();
    const scaleLogCopy = d3Scale.scaleLog().copy.toString();
    const scalePowCopy = d3Scale.scalePow().copy.toString();
    const scaleTimeCopy = d3Scale.scaleTime().copy.toString(); // always return the same reference to hint to consumers that
    // it is a pure function

    const identity$2 = d3Scale.scaleIdentity();
    var webglScaleMapper = (scale => {
      switch (scale.copy.toString()) {
        case scaleLinearCopy:
        case scaleTimeCopy:
          {
            return {
              scale: identity$2,
              webglScale: linear().domain(scale.domain())
            };
          }

        case scaleLogCopy:
          {
            return {
              scale: identity$2,
              webglScale: log().domain(scale.domain()).base(scale.base())
            };
          }

        case scalePowCopy:
          {
            return {
              scale: identity$2,
              webglScale: pow().domain(scale.domain()).exponent(scale.exponent())
            };
          }

        default:
          {
            // always return a copy of the scale to hint to consumers
            // that it may be an impure function
            return {
              scale: scale.copy(),
              webglScale: linear().domain(scale.range())
            };
          }
      }
    });

    var squarePointShader = (() => {
      const vertexShader = shaderBuilder(vertexShaderBase);
      const fragmentShader = shaderBuilder(fragmentShaderBase);
      vertexShader.appendHeader(square.header).appendBody(square.body);
      fragmentShader.appendHeader(square$1.header).appendBody(square$1.body);
      return {
        vertex: () => vertexShader,
        fragment: () => fragmentShader
      };
    });

    var trianglePointShader = (() => {
      const vertexShader = shaderBuilder(vertexShaderBase);
      const fragmentShader = shaderBuilder(fragmentShaderBase);
      vertexShader.appendHeader(triangle.header).appendBody(triangle.body);
      fragmentShader.appendHeader(triangle$1.header).appendBody(triangle$1.body);
      return {
        vertex: () => vertexShader,
        fragment: () => fragmentShader
      };
    });

    var crossPointShader = (() => {
      const vertexShader = shaderBuilder(vertexShaderBase);
      const fragmentShader = shaderBuilder(fragmentShaderBase);
      vertexShader.appendHeader(cross.header).appendBody(cross.body);
      fragmentShader.appendHeader(cross$1.header).appendBody(cross$1.body);
      return {
        vertex: () => vertexShader,
        fragment: () => fragmentShader
      };
    });

    var diamondPointShader = (() => {
      const vertexShader = shaderBuilder(vertexShaderBase);
      const fragmentShader = shaderBuilder(fragmentShaderBase);
      vertexShader.appendHeader(diamond.header).appendBody(diamond.body);
      fragmentShader.appendHeader(diamond$1.header).appendBody(diamond$1.body);
      return {
        vertex: () => vertexShader,
        fragment: () => fragmentShader
      };
    });

    var starPointShader = (() => {
      const vertexShader = shaderBuilder(vertexShaderBase);
      const fragmentShader = shaderBuilder(fragmentShaderBase);
      vertexShader.appendHeader(star.header).appendBody(star.body);
      fragmentShader.appendHeader(star$1.header).appendBody(star$1.body);
      return {
        vertex: () => vertexShader,
        fragment: () => fragmentShader
      };
    });

    var wyePointShader = (() => {
      const vertexShader = shaderBuilder(vertexShaderBase);
      const fragmentShader = shaderBuilder(fragmentShaderBase);
      vertexShader.appendHeader(wye.header).appendBody(wye.body);
      fragmentShader.appendHeader(wye$1.header).appendBody(wye$1.body);
      return {
        vertex: () => vertexShader,
        fragment: () => fragmentShader
      };
    });

    var webglSymbolMapper = (symbol => {
      switch (symbol) {
        case d3Shape.symbolCircle:
          return circlePointShader();

        case d3Shape.symbolSquare:
          return squarePointShader();

        case d3Shape.symbolTriangle:
          return trianglePointShader();

        case d3Shape.symbolCross:
          return crossPointShader();

        case d3Shape.symbolDiamond:
          return diamondPointShader();

        case d3Shape.symbolStar:
          return starPointShader();

        case d3Shape.symbolWye:
          return wyePointShader();

        default:
          throw new Error(`Unrecognised symbol: ${symbol}`);
      }
    });

    var constantAttribute = (initialValue => {
      const base = baseAttributeBuilder().divisor(1);
      let value = initialValue;
      let dirty = true;

      const constantAttribute = programBuilder => {
        base(programBuilder);

        if (!dirty) {
          return;
        }

        if (!Array.isArray(value)) {
          throw new Error(`Expected an array, received: ${value}`);
        }

        if (value.length !== base.size()) {
          throw new Error(`Expected array of length: ${base.size()}, recieved array of length: ${value.length}`);
        }

        const gl = programBuilder.context();
        gl[`vertexAttrib${value.length}fv`](base.location(), value);
        gl.disableVertexAttribArray(base.location());
        dirty = false;
      };

      constantAttribute.clear = () => {
        dirty = true;
      };

      constantAttribute.value = (...args) => {
        if (!args.length) {
          return value;
        }

        value = args[0];
        dirty = true;
        return constantAttribute;
      };

      rebind(constantAttribute, base, 'normalized', 'size', 'location');
      return constantAttribute;
    });

    var fillColor$2 = ((initialValue = [0, 0, 0, 1]) => {
      const attribute = webglElementAttribute().size(4);
      let value = initialValue;
      let dirty = true;

      const fillColor$2 = programBuilder => {
        programBuilder.vertexShader().appendHeaderIfNotExists(fillColor.header).appendBodyIfNotExists(fillColor.body);
        programBuilder.fragmentShader().appendHeaderIfNotExists(fillColor$1.header).appendBodyIfNotExists(fillColor$1.body);

        if (!dirty) {
          return;
        }

        if (Array.isArray(value)) {
          programBuilder.buffers().attribute('aFillColor', constantAttribute(value).size(4));
        } else if (typeof value === 'function') {
          attribute.value(value);
          programBuilder.buffers().attribute('aFillColor', attribute);
        } else {
          throw new Error(`Expected value to be an array or function, received ${value}`);
        }

        dirty = false;
      };

      fillColor$2.value = (...args) => {
        if (!args.length) {
          return value;
        }

        if (value !== args[0]) {
          value = args[0];
          dirty = true;
        }

        return fillColor$2;
      };

      rebind(fillColor$2, attribute, 'data');
      return fillColor$2;
    });

    var strokeColor$2 = ((initialValue = [0, 0, 0, 1]) => {
      const attribute = webglElementAttribute().size(4);
      let value = initialValue;
      let dirty = true;

      const strokeColor$2 = programBuilder => {
        programBuilder.vertexShader().appendHeaderIfNotExists(strokeColor.header).appendBodyIfNotExists(strokeColor.body);
        programBuilder.fragmentShader().appendHeaderIfNotExists(strokeColor$1.header).appendBodyIfNotExists(strokeColor$1.body);

        if (!dirty) {
          return;
        }

        if (Array.isArray(value)) {
          programBuilder.buffers().attribute('aStrokeColor', constantAttribute(value).size(4));
        } else if (typeof value === 'function') {
          attribute.value(value);
          programBuilder.buffers().attribute('aStrokeColor', attribute);
        } else {
          throw new Error(`Expected value to be an array or function, received ${value}`);
        }

        dirty = false;
      };

      strokeColor$2.value = (...args) => {
        if (!args.length) {
          return value;
        }

        if (value !== args[0]) {
          value = args[0];
          dirty = true;
        }

        return strokeColor$2;
      };

      rebind(strokeColor$2, attribute, 'data');
      return strokeColor$2;
    });

    var line$1 = (() => {
      const base = xyBase();
      const crossValueAttribute = webglAdjacentElementAttribute(-1, 2);
      const crossPreviousValueAttribute = crossValueAttribute.offset(-1);
      const crossNextValueAttribute = crossValueAttribute.offset(1);
      const crossNextNextValueAttribute = crossValueAttribute.offset(2);
      const mainValueAttribute = webglAdjacentElementAttribute(-1, 2);
      const mainPreviousValueAttribute = mainValueAttribute.offset(-1);
      const mainNextValueAttribute = mainValueAttribute.offset(1);
      const mainNextNextValueAttribute = mainValueAttribute.offset(2);
      const definedAttribute = webglAdjacentElementAttribute(0, 1).type(types.UNSIGNED_BYTE);
      const definedNextAttribute = definedAttribute.offset(1);
      const draw = webglSeriesLine().crossPreviousValueAttribute(crossPreviousValueAttribute).crossValueAttribute(crossValueAttribute).crossNextValueAttribute(crossNextValueAttribute).crossNextNextValueAttribute(crossNextNextValueAttribute).mainPreviousValueAttribute(mainPreviousValueAttribute).mainValueAttribute(mainValueAttribute).mainNextValueAttribute(mainNextValueAttribute).mainNextNextValueAttribute(mainNextNextValueAttribute).definedAttribute(definedAttribute).definedNextAttribute(definedNextAttribute);

      let equals = (previousData, data) => false;

      let scaleMapper = webglScaleMapper;
      let previousData = [];
      let previousXScale = null;
      let previousYScale = null;

      const line = data => {
        const xScale = scaleMapper(base.xScale());
        const yScale = scaleMapper(base.yScale());
        const dataChanged = !equals(previousData, data);

        if (dataChanged) {
          previousData = data;
          definedAttribute.value((d, i) => base.defined()(d, i)).data(data);
        }

        if (dataChanged || xScale.scale !== previousXScale) {
          previousXScale = xScale.scale;

          if (base.orient() === 'vertical') {
            crossValueAttribute.value((d, i) => xScale.scale(base.crossValue()(d, i))).data(data);
          } else {
            crossValueAttribute.value((d, i) => xScale.scale(base.mainValue()(d, i))).data(data);
          }
        }

        if (dataChanged || yScale.scale !== previousYScale) {
          previousYScale = yScale.scale;

          if (base.orient() === 'vertical') {
            mainValueAttribute.value((d, i) => yScale.scale(base.mainValue()(d, i))).data(data);
          } else {
            mainValueAttribute.value((d, i) => yScale.scale(base.crossValue()(d, i))).data(data);
          }
        }

        draw.xScale(xScale.webglScale).yScale(yScale.webglScale).decorate(program => base.decorate()(program, data, 0));
        draw(data.length);
      };

      line.equals = (...args) => {
        if (!args.length) {
          return equals;
        }

        equals = args[0];
        return line;
      };

      line.scaleMapper = (...args) => {
        if (!args.length) {
          return scaleMapper;
        }

        scaleMapper = args[0];
        return line;
      };

      rebindAll(line, base, exclude('baseValue', 'bandwidth', 'align'));
      rebind(line, draw, 'context', 'lineWidth');
      return line;
    });

    var seriesSvgPoint = (() => {
      const symbol = d3Shape.symbol();
      const base = xyBase();
      const join = dataJoin('g', 'point');

      const containerTransform = origin => 'translate(' + origin[0] + ', ' + origin[1] + ')';

      const point = selection => {
        if (selection.selection) {
          join.transition(selection);
        }

        selection.each((data, index, group) => {
          const filteredData = data.filter(base.defined());
          const g = join(d3Selection.select(group[index]), filteredData);
          g.enter().attr('transform', (d, i) => containerTransform(base.values(d, i).origin)).attr('fill', colors.gray).attr('stroke', colors.black).append('path');
          g.attr('transform', (d, i) => containerTransform(base.values(d, i).origin)).select('path').attr('d', symbol);
          base.decorate()(g, data, index);
        });
      };

      rebindAll(point, base, exclude('baseValue', 'bandwidth', 'align'));
      rebind(point, join, 'key');
      rebind(point, symbol, 'type', 'size');
      return point;
    });

    var seriesCanvasPoint = (() => {
      const symbol = d3Shape.symbol();
      const base = xyBase();

      const point = data => {
        const filteredData = data.filter(base.defined());
        const context = symbol.context();
        filteredData.forEach((d, i) => {
          context.save();
          const values = base.values(d, i);
          context.translate(values.origin[0], values.origin[1]);
          context.beginPath();
          context.strokeStyle = colors.black;
          context.fillStyle = colors.gray;
          base.decorate()(context, d, i);
          symbol(d, i);
          context.fill();
          context.stroke();
          context.closePath();
          context.restore();
        });
      };

      rebindAll(point, base, exclude('baseValue', 'bandwidth', 'align'));
      rebind(point, symbol, 'size', 'type', 'context');
      return point;
    });

    var point = (() => {
      const base = xyBase();
      let size = functor$4(64);
      let type = d3Shape.symbolCircle;
      const crossValueAttribute = webglElementAttribute();
      const mainValueAttribute = webglElementAttribute();
      const sizeAttribute = webglElementAttribute().type(types.UNSIGNED_SHORT);
      const definedAttribute = webglElementAttribute().type(types.UNSIGNED_BYTE);
      const draw = webglSeriesPoint().crossValueAttribute(crossValueAttribute).mainValueAttribute(mainValueAttribute).sizeAttribute(sizeAttribute).definedAttribute(definedAttribute);

      let equals = (previousData, data) => false;

      let scaleMapper = webglScaleMapper;
      let previousData = [];
      let previousXScale = null;
      let previousYScale = null;

      const point = data => {
        const xScale = scaleMapper(base.xScale());
        const yScale = scaleMapper(base.yScale());
        const dataChanged = !equals(previousData, data);

        if (dataChanged) {
          previousData = data;
          sizeAttribute.value((d, i) => size(d, i)).data(data);
          definedAttribute.value((d, i) => base.defined()(d, i)).data(data);
        }

        if (dataChanged || xScale.scale !== previousXScale) {
          previousXScale = xScale.scale;

          if (base.orient() === 'vertical') {
            crossValueAttribute.value((d, i) => xScale.scale(base.crossValue()(d, i))).data(data);
          } else {
            crossValueAttribute.value((d, i) => xScale.scale(base.mainValue()(d, i))).data(data);
          }
        }

        if (dataChanged || yScale.scale !== previousYScale) {
          previousYScale = yScale.scale;

          if (base.orient() === 'vertical') {
            mainValueAttribute.value((d, i) => yScale.scale(base.mainValue()(d, i))).data(data);
          } else {
            mainValueAttribute.value((d, i) => yScale.scale(base.crossValue()(d, i))).data(data);
          }
        }

        draw.xScale(xScale.webglScale).yScale(yScale.webglScale).type(webglSymbolMapper(type)).decorate(program => base.decorate()(program, data, 0));
        draw(data.length);
      };

      point.size = (...args) => {
        if (!args.length) {
          return size;
        }

        size = functor$4(args[0]);
        return point;
      };

      point.type = (...args) => {
        if (!args.length) {
          return type;
        }

        type = args[0];
        return point;
      };

      point.equals = (...args) => {
        if (!args.length) {
          return equals;
        }

        equals = args[0];
        return point;
      };

      point.scaleMapper = (...args) => {
        if (!args.length) {
          return scaleMapper;
        }

        scaleMapper = args[0];
        return point;
      };

      rebindAll(point, base, exclude('baseValue', 'bandwidth', 'align'));
      rebind(point, draw, 'context');
      return point;
    });

    var bar$2 = (() => {
      const pathGenerator = shapeBar().x(0).y(0);
      const base = xyBase();
      const join = dataJoin('g', 'bar');

      const valueAxisDimension = generator => base.orient() === 'vertical' ? generator.height : generator.width;

      const crossAxisDimension = generator => base.orient() === 'vertical' ? generator.width : generator.height;

      const translation = origin => 'translate(' + origin[0] + ', ' + origin[1] + ')';

      const bar = selection => {
        if (selection.selection) {
          join.transition(selection);
        }

        selection.each((data, index, group) => {
          const orient = base.orient();

          if (orient !== 'vertical' && orient !== 'horizontal') {
            throw new Error('The bar series does not support an orientation of ' + orient);
          }

          const filteredData = data.filter(base.defined());
          const projectedData = filteredData.map(base.values);
          pathGenerator.width(0).height(0);

          if (base.orient() === 'vertical') {
            pathGenerator.verticalAlign('top');
            pathGenerator.horizontalAlign('center');
          } else {
            pathGenerator.horizontalAlign('right');
            pathGenerator.verticalAlign('center');
          }

          const g = join(d3Selection.select(group[index]), filteredData); // within the enter selection the pathGenerator creates a zero
          // height bar on the baseline. As a result, when used with a transition the bar grows
          // from y0 to y1 (y)

          g.enter().attr('transform', (_, i) => translation(projectedData[i].baseOrigin)).attr('class', 'bar ' + base.orient()).attr('fill', colors.darkGray).append('path').attr('d', (d, i) => {
            crossAxisDimension(pathGenerator)(projectedData[i].width);
            return pathGenerator([d]);
          }); // the container translation sets the origin to the 'tip'
          // of each bar as per the decorate pattern

          g.attr('transform', (_, i) => translation(projectedData[i].origin)).select('path').attr('d', (d, i) => {
            crossAxisDimension(pathGenerator)(projectedData[i].width);
            valueAxisDimension(pathGenerator)(-projectedData[i].height);
            return pathGenerator([d]);
          });
          base.decorate()(g, filteredData, index);
        });
      };

      rebindAll(bar, base);
      rebind(bar, join, 'key');
      return bar;
    });

    var bar$3 = (() => {
      const base = xyBase();
      const pathGenerator = shapeBar().x(0).y(0);

      const valueAxisDimension = generator => base.orient() === 'vertical' ? generator.height : generator.width;

      const crossAxisDimension = generator => base.orient() === 'vertical' ? generator.width : generator.height;

      const bar = data => {
        const context = pathGenerator.context();
        const filteredData = data.filter(base.defined());
        const projectedData = filteredData.map(base.values);

        if (base.orient() === 'vertical') {
          pathGenerator.verticalAlign('top');
          pathGenerator.horizontalAlign('center');
        } else {
          pathGenerator.horizontalAlign('right');
          pathGenerator.verticalAlign('center');
        }

        projectedData.forEach((datum, i) => {
          context.save();
          context.beginPath();
          context.translate(datum.origin[0], datum.origin[1]);
          context.fillStyle = colors.darkGray;
          context.strokeStyle = 'transparent';
          base.decorate()(context, datum.d, i);
          valueAxisDimension(pathGenerator)(-datum.height);
          crossAxisDimension(pathGenerator)(datum.width);
          pathGenerator([datum]);
          context.fill();
          context.stroke();
          context.closePath();
          context.restore();
        });
      };

      rebindAll(bar, base);
      rebind(bar, pathGenerator, 'context');
      return bar;
    });

    var bar$4 = (() => {
      const base = xyBase();
      const crossValueAttribute = webglElementAttribute();
      const mainValueAttribute = webglElementAttribute();
      const baseValueAttribute = webglElementAttribute();
      const bandwidthAttribute = webglElementAttribute().type(types.UNSIGNED_SHORT);
      const definedAttribute = webglElementAttribute().type(types.UNSIGNED_BYTE);
      const draw = webglSeriesBar().crossValueAttribute(crossValueAttribute).mainValueAttribute(mainValueAttribute).baseValueAttribute(baseValueAttribute).bandwidthAttribute(bandwidthAttribute).definedAttribute(definedAttribute);

      let equals = (previousData, data) => false;

      let scaleMapper = webglScaleMapper;
      let previousData = [];
      let previousXScale = null;
      let previousYScale = null;

      const bar = data => {
        if (base.orient() !== 'vertical') {
          throw new Error(`Unsupported orientation ${base.orient()}`);
        }

        const xScale = scaleMapper(base.xScale());
        const yScale = scaleMapper(base.yScale());
        const dataChanged = !equals(previousData, data);

        if (dataChanged) {
          previousData = data;
          bandwidthAttribute.value((d, i) => base.bandwidth()(d, i)).data(data);
          definedAttribute.value((d, i) => base.defined()(d, i)).data(data);
        }

        if (dataChanged || xScale.scale !== previousXScale) {
          previousXScale = xScale.scale;
          crossValueAttribute.value((d, i) => xScale.scale(base.crossValue()(d, i))).data(data);
        }

        if (dataChanged || yScale.scale !== previousYScale) {
          previousYScale = yScale.scale;
          baseValueAttribute.value((d, i) => yScale.scale(base.baseValue()(d, i))).data(data);
          mainValueAttribute.value((d, i) => yScale.scale(base.mainValue()(d, i))).data(data);
        }

        draw.xScale(xScale.webglScale).yScale(yScale.webglScale).decorate(program => base.decorate()(program, data, 0));
        draw(data.length);
      };

      bar.equals = (...args) => {
        if (!args.length) {
          return equals;
        }

        equals = args[0];
        return bar;
      };

      bar.scaleMapper = (...args) => {
        if (!args.length) {
          return scaleMapper;
        }

        scaleMapper = args[0];
        return bar;
      };

      rebindAll(bar, base, exclude('align'));
      rebind(bar, draw, 'context');
      return bar;
    });

    var errorBarBase = (() => {
      let highValue = d => d.high;

      let lowValue = d => d.low;

      let crossValue = d => d.cross;

      let orient = 'vertical';
      let align = 'center';

      let bandwidth = () => 5;

      const base = createBase({
        decorate: () => {},
        defined: (d, i) => defined(lowValue, highValue, crossValue)(d, i),
        xScale: d3Scale.scaleIdentity(),
        yScale: d3Scale.scaleIdentity()
      });

      base.values = (d, i) => {
        const width = bandwidth(d, i);
        const offset = alignOffset(align, width);
        const xScale = base.xScale();
        const yScale = base.yScale();

        if (orient === 'vertical') {
          const y = yScale(highValue(d, i));
          return {
            origin: [xScale(crossValue(d, i)) + offset, y],
            high: 0,
            low: yScale(lowValue(d, i)) - y,
            width
          };
        } else {
          const x = xScale(lowValue(d, i));
          return {
            origin: [x, yScale(crossValue(d, i)) + offset],
            high: xScale(highValue(d, i)) - x,
            low: 0,
            width
          };
        }
      };

      base.xValues = () => orient === 'vertical' ? [crossValue] : [highValue, lowValue];

      base.yValues = () => orient !== 'vertical' ? [crossValue] : [highValue, lowValue];

      base.orient = (...args) => {
        if (!args.length) {
          return orient;
        }

        orient = args[0];
        return base;
      };

      base.lowValue = (...args) => {
        if (!args.length) {
          return lowValue;
        }

        lowValue = functor$4(args[0]);
        return base;
      };

      base.highValue = (...args) => {
        if (!args.length) {
          return highValue;
        }

        highValue = functor$4(args[0]);
        return base;
      };

      base.crossValue = (...args) => {
        if (!args.length) {
          return crossValue;
        }

        crossValue = functor$4(args[0]);
        return base;
      };

      base.bandwidth = (...args) => {
        if (!args.length) {
          return bandwidth;
        }

        bandwidth = functor$4(args[0]);
        return base;
      };

      base.align = (...args) => {
        if (!args.length) {
          return align;
        }

        align = args[0];
        return base;
      };

      return base;
    });

    var errorBar$2 = (() => {
      const base = errorBarBase();
      const join = dataJoin('g', 'error-bar');
      const pathGenerator = shapeErrorBar().value(0);

      const propagateTransition = maybeTransition => selection => maybeTransition.selection ? selection.transition(maybeTransition) : selection;

      const containerTranslation = values => 'translate(' + values.origin[0] + ', ' + values.origin[1] + ')';

      const errorBar = selection => {
        if (selection.selection) {
          join.transition(selection);
        }

        const transitionPropagator = propagateTransition(selection);
        selection.each((data, index, group) => {
          const filteredData = data.filter(base.defined());
          const projectedData = filteredData.map(base.values);
          const g = join(d3Selection.select(group[index]), filteredData);
          g.enter().attr('stroke', colors.black).attr('fill', colors.gray).attr('transform', (d, i) => containerTranslation(base.values(d, i)) + ' scale(1e-6, 1)').append('path');
          pathGenerator.orient(base.orient());
          g.each((d, i, g) => {
            const values = projectedData[i];
            pathGenerator.high(values.high).low(values.low).width(values.width);
            transitionPropagator(d3Selection.select(g[i])).attr('transform', containerTranslation(values) + ' scale(1)').select('path').attr('d', pathGenerator([d]));
          });
          base.decorate()(g, data, index);
        });
      };

      rebindAll(errorBar, base);
      rebind(errorBar, join, 'key');
      return errorBar;
    });

    var errorBar$3 = (() => {
      const base = errorBarBase();
      const pathGenerator = shapeErrorBar().value(0);

      const errorBar = data => {
        const filteredData = data.filter(base.defined());
        const context = pathGenerator.context();
        pathGenerator.orient(base.orient());
        filteredData.forEach((d, i) => {
          context.save();
          const values = base.values(d, i);
          context.translate(values.origin[0], values.origin[1]);
          context.beginPath();
          context.strokeStyle = colors.black;
          context.fillStyle = colors.gray;
          base.decorate()(context, d, i);
          pathGenerator.high(values.high).width(values.width).low(values.low)([d]);
          context.fill();
          context.stroke();
          context.closePath();
          context.restore();
        });
      };

      rebindAll(errorBar, base);
      rebind(errorBar, pathGenerator, 'context');
      return errorBar;
    });

    var errorBar$4 = (() => {
      const base = errorBarBase();
      const crossValueAttribute = webglElementAttribute();
      const highValueAttribute = webglElementAttribute();
      const lowValueAttribute = webglElementAttribute();
      const bandwidthAttribute = webglElementAttribute().type(types.UNSIGNED_SHORT);
      const definedAttribute = webglElementAttribute().type(types.UNSIGNED_BYTE);
      const draw = webglSeriesErrorBar().crossValueAttribute(crossValueAttribute).highValueAttribute(highValueAttribute).lowValueAttribute(lowValueAttribute).bandwidthAttribute(bandwidthAttribute).definedAttribute(definedAttribute);

      let equals = (previousData, data) => false;

      let scaleMapper = webglScaleMapper;
      let previousData = [];
      let previousXScale = null;
      let previousYScale = null;

      const errorBar = data => {
        if (base.orient() !== 'vertical') {
          throw new Error(`Unsupported orientation ${base.orient()}`);
        }

        const xScale = scaleMapper(base.xScale());
        const yScale = scaleMapper(base.yScale());
        const dataChanged = !equals(previousData, data);

        if (dataChanged) {
          previousData = data;
          bandwidthAttribute.value((d, i) => base.bandwidth()(d, i)).data(data);
          definedAttribute.value((d, i) => base.defined()(d, i)).data(data);
        }

        if (dataChanged || xScale.scale !== previousXScale) {
          previousXScale = xScale.scale;
          crossValueAttribute.value((d, i) => xScale.scale(base.crossValue()(d, i))).data(data);
        }

        if (dataChanged || yScale.scale !== previousYScale) {
          previousYScale = yScale.scale;
          highValueAttribute.value((d, i) => yScale.scale(base.highValue()(d, i))).data(data);
          lowValueAttribute.value((d, i) => yScale.scale(base.lowValue()(d, i))).data(data);
        }

        draw.xScale(xScale.webglScale).yScale(yScale.webglScale).decorate(program => base.decorate()(program, data, 0));
        draw(data.length);
      };

      errorBar.equals = (...args) => {
        if (!args.length) {
          return equals;
        }

        equals = args[0];
        return errorBar;
      };

      errorBar.scaleMapper = (...args) => {
        if (!args.length) {
          return scaleMapper;
        }

        scaleMapper = args[0];
        return errorBar;
      };

      rebindAll(errorBar, base, exclude('align'));
      rebind(errorBar, draw, 'context', 'lineWidth');
      return errorBar;
    });

    var area$2 = (() => {
      const base = xyBase();
      const areaData = d3Shape.area();
      const join = dataJoin('path', 'area');

      const area = selection => {
        if (selection.selection) {
          join.transition(selection);
        }

        areaData.defined(base.defined());
        selection.each((data, index, group) => {
          const projectedData = data.map(base.values);
          areaData.x((_, i) => projectedData[i].transposedX).y((_, i) => projectedData[i].transposedY);
          const valueComponent = base.orient() === 'vertical' ? 'y' : 'x';
          areaData[valueComponent + '0']((_, i) => projectedData[i].y0);
          areaData[valueComponent + '1']((_, i) => projectedData[i].y);
          const path = join(d3Selection.select(group[index]), [data]);
          path.enter().attr('fill', colors.gray);
          path.attr('d', areaData);
          base.decorate()(path, data, index);
        });
      };

      rebindAll(area, base, exclude('bandwidth', 'align'));
      rebind(area, join, 'key');
      rebind(area, areaData, 'curve');
      return area;
    });

    var area$3 = (() => {
      const base = xyBase();
      const areaData = d3Shape.area();

      const area = data => {
        const context = areaData.context();
        areaData.defined(base.defined());
        const projectedData = data.map(base.values);
        areaData.x((_, i) => projectedData[i].transposedX).y((_, i) => projectedData[i].transposedY);
        const valueComponent = base.orient() === 'vertical' ? 'y' : 'x';
        areaData[valueComponent + '0']((_, i) => projectedData[i].y0);
        areaData[valueComponent + '1']((_, i) => projectedData[i].y);
        context.beginPath();
        context.fillStyle = colors.gray;
        context.strokeStyle = 'transparent';
        base.decorate()(context, data);
        areaData(data);
        context.fill();
        context.stroke();
        context.closePath();
      };

      rebindAll(area, base, exclude('bandwidth', 'align'));
      rebind(area, areaData, 'curve', 'context');
      return area;
    });

    var area$4 = (() => {
      const base = xyBase();
      const crossValueAttribute = webglAdjacentElementAttribute(0, 1);
      const crossNextValueAttribute = crossValueAttribute.offset(1);
      const mainValueAttribute = webglAdjacentElementAttribute(0, 1);
      const mainNextValueAttribute = mainValueAttribute.offset(1);
      const baseValueAttribute = webglAdjacentElementAttribute(0, 1);
      const baseNextValueAttribute = baseValueAttribute.offset(1);
      const definedAttribute = webglAdjacentElementAttribute(0, 1).type(types.UNSIGNED_BYTE);
      const definedNextAttribute = definedAttribute.offset(1);
      const draw = webglSeriesArea().crossValueAttribute(crossValueAttribute).crossNextValueAttribute(crossNextValueAttribute).mainValueAttribute(mainValueAttribute).mainNextValueAttribute(mainNextValueAttribute).baseValueAttribute(baseValueAttribute).baseNextValueAttribute(baseNextValueAttribute).definedAttribute(definedAttribute).definedNextAttribute(definedNextAttribute);

      let equals = (previousData, data) => false;

      let scaleMapper = webglScaleMapper;
      let previousData = [];
      let previousXScale = null;
      let previousYScale = null;

      const area = data => {
        if (base.orient() !== 'vertical') {
          throw new Error(`Unsupported orientation ${base.orient()}`);
        }

        const xScale = scaleMapper(base.xScale());
        const yScale = scaleMapper(base.yScale());
        const dataChanged = !equals(previousData, data);

        if (dataChanged) {
          previousData = data;
          definedAttribute.value((d, i) => base.defined()(d, i)).data(data);
        }

        if (dataChanged || xScale.scale !== previousXScale) {
          previousXScale = xScale.scale;
          crossValueAttribute.value((d, i) => xScale.scale(base.crossValue()(d, i))).data(data);
        }

        if (dataChanged || yScale.scale !== previousYScale) {
          previousYScale = yScale.scale;
          baseValueAttribute.value((d, i) => yScale.scale(base.baseValue()(d, i))).data(data);
          mainValueAttribute.value((d, i) => yScale.scale(base.mainValue()(d, i))).data(data);
        }

        draw.xScale(xScale.webglScale).yScale(yScale.webglScale).decorate(program => base.decorate()(program, data, 0));
        draw(data.length);
      };

      area.equals = (...args) => {
        if (!args.length) {
          return equals;
        }

        equals = args[0];
        return area;
      };

      area.scaleMapper = (...args) => {
        if (!args.length) {
          return scaleMapper;
        }

        scaleMapper = args[0];
        return area;
      };

      rebindAll(area, base, exclude('bandwidth', 'align'));
      rebind(area, draw, 'context');
      return area;
    });

    var ohlcBase = (() => {
      let base;

      let crossValue = d => d.date;

      let openValue = d => d.open;

      let highValue = d => d.high;

      let lowValue = d => d.low;

      let closeValue = d => d.close;

      let bandwidth = () => 5;

      let align = 'center';

      let crossValueScaled = (d, i) => base.xScale()(crossValue(d, i));

      base = createBase({
        decorate: () => {},
        defined: (d, i) => defined(crossValue, openValue, lowValue, highValue, closeValue)(d, i),
        xScale: d3Scale.scaleIdentity(),
        yScale: d3Scale.scaleIdentity()
      });

      base.values = (d, i) => {
        const closeRaw = closeValue(d, i);
        const openRaw = openValue(d, i);
        const width = bandwidth(d, i);
        const offset = alignOffset(align, width);
        let direction = '';

        if (closeRaw > openRaw) {
          direction = 'up';
        } else if (closeRaw < openRaw) {
          direction = 'down';
        }

        return {
          cross: crossValueScaled(d, i) + offset,
          open: base.yScale()(openRaw),
          high: base.yScale()(highValue(d, i)),
          low: base.yScale()(lowValue(d, i)),
          close: base.yScale()(closeRaw),
          width,
          direction
        };
      };

      base.xValues = () => [crossValue];

      base.yValues = () => [openValue, highValue, lowValue, closeValue];

      base.crossValue = (...args) => {
        if (!args.length) {
          return crossValue;
        }

        crossValue = args[0];
        return base;
      };

      base.openValue = (...args) => {
        if (!args.length) {
          return openValue;
        }

        openValue = args[0];
        return base;
      };

      base.highValue = (...args) => {
        if (!args.length) {
          return highValue;
        }

        highValue = args[0];
        return base;
      };

      base.lowValue = (...args) => {
        if (!args.length) {
          return lowValue;
        }

        lowValue = args[0];
        return base;
      };

      base.yValue = base.closeValue = (...args) => {
        if (!args.length) {
          return closeValue;
        }

        closeValue = args[0];
        return base;
      };

      base.bandwidth = (...args) => {
        if (!args.length) {
          return bandwidth;
        }

        bandwidth = functor$4(args[0]);
        return base;
      };

      base.align = (...args) => {
        if (!args.length) {
          return align;
        }

        align = args[0];
        return base;
      };

      return base;
    });

    var ohlcBase$1 = ((pathGenerator, seriesName) => {
      const base = ohlcBase();
      const join = dataJoin('g', seriesName);

      const containerTranslation = values => 'translate(' + values.cross + ', ' + values.high + ')';

      const propagateTransition = maybeTransition => selection => maybeTransition.selection ? selection.transition(maybeTransition) : selection;

      const candlestick = selection => {
        if (selection.selection) {
          join.transition(selection);
        }

        const transitionPropagator = propagateTransition(selection);
        selection.each((data, index, group) => {
          const filteredData = data.filter(base.defined());
          const g = join(d3Selection.select(group[index]), filteredData);
          g.enter().attr('transform', (d, i) => containerTranslation(base.values(d, i)) + ' scale(1e-6, 1)').append('path');
          g.each((d, i, g) => {
            const values = base.values(d, i);
            const color = values.direction === 'up' ? colors.green : colors.red;
            const singleCandlestick = transitionPropagator(d3Selection.select(g[i])).attr('class', seriesName + ' ' + values.direction).attr('stroke', color).attr('fill', color).attr('transform', () => containerTranslation(values) + ' scale(1)');
            pathGenerator.x(0).width(values.width).open(() => values.open - values.high).high(0).low(() => values.low - values.high).close(() => values.close - values.high);
            singleCandlestick.select('path').attr('d', pathGenerator([d]));
          });
          base.decorate()(g, data, index);
        });
      };

      rebind(candlestick, join, 'key');
      rebindAll(candlestick, base);
      return candlestick;
    });

    var candlestick$2 = (() => ohlcBase$1(shapeCandlestick(), 'candlestick'));

    var ohlcBase$2 = (pathGenerator => {
      const base = ohlcBase();

      const candlestick = data => {
        const filteredData = data.filter(base.defined());
        const context = pathGenerator.context();
        filteredData.forEach((d, i) => {
          context.save();
          const values = base.values(d, i);
          context.translate(values.cross, values.high);
          context.beginPath();
          pathGenerator.x(0).open(() => values.open - values.high).width(values.width).high(0).low(() => values.low - values.high).close(() => values.close - values.high)([d]);
          const color = values.direction === 'up' ? colors.green : colors.red;
          context.strokeStyle = color;
          context.fillStyle = color;
          base.decorate()(context, d, i);
          context.fill();
          context.stroke();
          context.closePath();
          context.restore();
        });
      };

      rebind(candlestick, pathGenerator, 'context');
      rebindAll(candlestick, base);
      return candlestick;
    });

    var candlestick$3 = (() => ohlcBase$2(shapeCandlestick()));

    var ohlcBase$3 = (pathGenerator => {
      const base = ohlcBase();
      const crossValueAttribute = webglElementAttribute();
      const openValueAttribute = webglElementAttribute();
      const highValueAttribute = webglElementAttribute();
      const lowValueAttribute = webglElementAttribute();
      const closeValueAttribute = webglElementAttribute();
      const bandwidthAttribute = webglElementAttribute().type(types.UNSIGNED_SHORT);
      const definedAttribute = webglElementAttribute().type(types.UNSIGNED_BYTE);
      pathGenerator.crossValueAttribute(crossValueAttribute).openValueAttribute(openValueAttribute).highValueAttribute(highValueAttribute).lowValueAttribute(lowValueAttribute).closeValueAttribute(closeValueAttribute).bandwidthAttribute(bandwidthAttribute).definedAttribute(definedAttribute);

      let equals = (previousData, data) => false;

      let scaleMapper = webglScaleMapper;
      let previousData = [];
      let previousXScale = null;
      let previousYScale = null;

      const candlestick = data => {
        const xScale = scaleMapper(base.xScale());
        const yScale = scaleMapper(base.yScale());
        const dataChanged = !equals(previousData, data);

        if (dataChanged) {
          previousData = data;
          bandwidthAttribute.value((d, i) => base.bandwidth()(d, i)).data(data);
          definedAttribute.value((d, i) => base.defined()(d, i)).data(data);
        }

        if (dataChanged || xScale.scale !== previousXScale) {
          previousXScale = xScale.scale;
          crossValueAttribute.value((d, i) => xScale.scale(base.crossValue()(d, i))).data(data);
        }

        if (dataChanged || yScale.scale !== previousYScale) {
          previousYScale = yScale.scale;
          openValueAttribute.value((d, i) => yScale.scale(base.openValue()(d, i))).data(data);
          highValueAttribute.value((d, i) => yScale.scale(base.highValue()(d, i))).data(data);
          lowValueAttribute.value((d, i) => yScale.scale(base.lowValue()(d, i))).data(data);
          closeValueAttribute.value((d, i) => yScale.scale(base.closeValue()(d, i))).data(data);
        }

        pathGenerator.xScale(xScale.webglScale).yScale(yScale.webglScale).decorate(program => base.decorate()(program, data, 0));
        pathGenerator(data.length);
      };

      candlestick.equals = (...args) => {
        if (!args.length) {
          return equals;
        }

        equals = args[0];
        return candlestick;
      };

      candlestick.scaleMapper = (...args) => {
        if (!args.length) {
          return scaleMapper;
        }

        scaleMapper = args[0];
        return candlestick;
      };

      rebindAll(candlestick, base, exclude('align'));
      rebind(candlestick, pathGenerator, 'context', 'lineWidth');
      return candlestick;
    });

    var candlestick$4 = (() => ohlcBase$3(webglSeriesCandlestick()));

    var boxPlotBase = (() => {
      let upperQuartileValue = d => d.upperQuartile;

      let lowerQuartileValue = d => d.lowerQuartile;

      let highValue = d => d.high;

      let lowValue = d => d.low;

      let crossValue = d => d.value;

      let medianValue = d => d.median;

      let orient = 'vertical';
      let align = 'center';

      let bandwidth = () => 5;

      const base = createBase({
        decorate: () => {},
        defined: (d, i) => defined(lowValue, highValue, lowerQuartileValue, upperQuartileValue, crossValue, medianValue)(d, i),
        xScale: d3Scale.scaleIdentity(),
        yScale: d3Scale.scaleIdentity()
      });

      base.values = (d, i) => {
        const width = bandwidth(d, i);
        const offset = alignOffset(align, width);
        const xScale = base.xScale();
        const yScale = base.yScale();

        if (orient === 'vertical') {
          const y = yScale(highValue(d, i));
          return {
            origin: [xScale(crossValue(d, i)) + offset, y],
            high: 0,
            upperQuartile: yScale(upperQuartileValue(d, i)) - y,
            median: yScale(medianValue(d, i)) - y,
            lowerQuartile: yScale(lowerQuartileValue(d, i)) - y,
            low: yScale(lowValue(d, i)) - y,
            width
          };
        } else {
          const x = xScale(lowValue(d, i));
          return {
            origin: [x, yScale(crossValue(d, i)) + offset],
            high: xScale(highValue(d, i)) - x,
            upperQuartile: xScale(upperQuartileValue(d, i)) - x,
            median: xScale(medianValue(d, i)) - x,
            lowerQuartile: xScale(lowerQuartileValue(d, i)) - x,
            low: 0,
            width
          };
        }
      };

      base.xValues = () => orient === 'vertical' ? [crossValue] : [upperQuartileValue, lowerQuartileValue, highValue, lowValue, medianValue];

      base.yValues = () => orient !== 'vertical' ? [crossValue] : [upperQuartileValue, lowerQuartileValue, highValue, lowValue, medianValue];

      base.orient = (...args) => {
        if (!args.length) {
          return orient;
        }

        orient = args[0];
        return base;
      };

      base.lowerQuartileValue = (...args) => {
        if (!args.length) {
          return lowerQuartileValue;
        }

        lowerQuartileValue = functor$4(args[0]);
        return base;
      };

      base.upperQuartileValue = (...args) => {
        if (!args.length) {
          return upperQuartileValue;
        }

        upperQuartileValue = functor$4(args[0]);
        return base;
      };

      base.lowValue = (...args) => {
        if (!args.length) {
          return lowValue;
        }

        lowValue = functor$4(args[0]);
        return base;
      };

      base.highValue = (...args) => {
        if (!args.length) {
          return highValue;
        }

        highValue = functor$4(args[0]);
        return base;
      };

      base.crossValue = (...args) => {
        if (!args.length) {
          return crossValue;
        }

        crossValue = functor$4(args[0]);
        return base;
      };

      base.medianValue = (...args) => {
        if (!args.length) {
          return medianValue;
        }

        medianValue = functor$4(args[0]);
        return base;
      };

      base.bandwidth = (...args) => {
        if (!args.length) {
          return bandwidth;
        }

        bandwidth = functor$4(args[0]);
        return base;
      };

      base.align = (...args) => {
        if (!args.length) {
          return align;
        }

        align = args[0];
        return base;
      };

      return base;
    });

    var boxPlot$2 = (() => {
      const base = boxPlotBase();
      const join = dataJoin('g', 'box-plot');
      const pathGenerator = shapeBoxPlot().value(0);

      const propagateTransition = maybeTransition => selection => maybeTransition.selection ? selection.transition(maybeTransition) : selection;

      const containerTranslation = values => 'translate(' + values.origin[0] + ', ' + values.origin[1] + ')';

      const boxPlot = selection => {
        if (selection.selection) {
          join.transition(selection);
        }

        const transitionPropagator = propagateTransition(selection);
        selection.each((data, index, group) => {
          const filteredData = data.filter(base.defined());
          const g = join(d3Selection.select(group[index]), filteredData);
          g.enter().attr('stroke', colors.black).attr('fill', colors.gray).attr('transform', (d, i) => containerTranslation(base.values(d, i)) + ' scale(1e-6, 1)').append('path');
          pathGenerator.orient(base.orient());
          g.each((d, i, g) => {
            const values = base.values(d, i);
            pathGenerator.median(values.median).upperQuartile(values.upperQuartile).lowerQuartile(values.lowerQuartile).width(values.width).high(values.high).low(values.low);
            transitionPropagator(d3Selection.select(g[i])).attr('transform', containerTranslation(values)).select('path').attr('d', pathGenerator([d]));
          });
          base.decorate()(g, data, index);
        });
      };

      rebindAll(boxPlot, base);
      rebind(boxPlot, join, 'key');
      rebind(boxPlot, pathGenerator, 'cap');
      return boxPlot;
    });

    var boxPlot$3 = (() => {
      const base = boxPlotBase();
      const pathGenerator = shapeBoxPlot().value(0);

      const boxPlot = data => {
        const filteredData = data.filter(base.defined());
        const context = pathGenerator.context();
        pathGenerator.orient(base.orient());
        filteredData.forEach((d, i) => {
          context.save();
          const values = base.values(d, i);
          context.translate(values.origin[0], values.origin[1]);
          context.beginPath();
          context.fillStyle = colors.gray;
          context.strokeStyle = colors.black;
          base.decorate()(context, d, i);
          pathGenerator.median(values.median).upperQuartile(values.upperQuartile).lowerQuartile(values.lowerQuartile).high(values.high).width(values.width).low(values.low)([d]);
          context.fill();
          context.stroke();
          context.closePath();
          context.restore();
        });
      };

      rebindAll(boxPlot, base);
      rebind(boxPlot, pathGenerator, 'cap', 'context');
      return boxPlot;
    });

    var boxPlot$4 = (() => {
      const base = boxPlotBase();
      const crossValueAttribute = webglElementAttribute();
      const highValueAttribute = webglElementAttribute();
      const upperQuartileValueAttribute = webglElementAttribute();
      const medianValueAttribute = webglElementAttribute();
      const lowerQuartileValueAttribute = webglElementAttribute();
      const lowValueAttribute = webglElementAttribute();
      const bandwidthAttribute = webglElementAttribute().type(types.UNSIGNED_SHORT);
      const capAttribute = webglElementAttribute().type(types.UNSIGNED_SHORT);
      const definedAttribute = webglElementAttribute().type(types.UNSIGNED_BYTE);
      const draw = webglSeriesBoxPlot().crossValueAttribute(crossValueAttribute).highValueAttribute(highValueAttribute).upperQuartileValueAttribute(upperQuartileValueAttribute).medianValueAttribute(medianValueAttribute).lowerQuartileValueAttribute(lowerQuartileValueAttribute).lowValueAttribute(lowValueAttribute).bandwidthAttribute(bandwidthAttribute).capAttribute(capAttribute).definedAttribute(definedAttribute);

      let equals = (previousData, data) => false;

      let scaleMapper = webglScaleMapper;
      let previousData = [];
      let previousXScale = null;
      let previousYScale = null;
      let cap = functor$4(20);

      const boxPlot = data => {
        if (base.orient() !== 'vertical') {
          throw new Error(`Unsupported orientation ${base.orient()}`);
        }

        const xScale = scaleMapper(base.xScale());
        const yScale = scaleMapper(base.yScale());
        const dataChanged = !equals(previousData, data);

        if (dataChanged) {
          previousData = data;
          bandwidthAttribute.value((d, i) => base.bandwidth()(d, i)).data(data);
          capAttribute.value((d, i) => cap(d, i)).data(data);
          definedAttribute.value((d, i) => base.defined()(d, i)).data(data);
        }

        if (dataChanged || xScale.scale !== previousXScale) {
          previousXScale = xScale.scale;
          crossValueAttribute.value((d, i) => xScale.scale(base.crossValue()(d, i))).data(data);
        }

        if (dataChanged || yScale.scale !== previousYScale) {
          previousYScale = yScale.scale;
          highValueAttribute.value((d, i) => yScale.scale(base.highValue()(d, i))).data(data);
          upperQuartileValueAttribute.value((d, i) => yScale.scale(base.upperQuartileValue()(d, i))).data(data);
          medianValueAttribute.value((d, i) => yScale.scale(base.medianValue()(d, i))).data(data);
          lowerQuartileValueAttribute.value((d, i) => yScale.scale(base.lowerQuartileValue()(d, i))).data(data);
          lowValueAttribute.value((d, i) => yScale.scale(base.lowValue()(d, i))).data(data);
        }

        draw.xScale(xScale.webglScale).yScale(yScale.webglScale).decorate(program => base.decorate()(program, data, 0));
        draw(data.length);
      };

      boxPlot.cap = (...args) => {
        if (!args.length) {
          return cap;
        }

        cap = functor$4(args[0]);
        return boxPlot;
      };

      boxPlot.equals = (...args) => {
        if (!args.length) {
          return equals;
        }

        equals = args[0];
        return boxPlot;
      };

      boxPlot.scaleMapper = (...args) => {
        if (!args.length) {
          return scaleMapper;
        }

        scaleMapper = args[0];
        return boxPlot;
      };

      rebindAll(boxPlot, base, exclude('align'));
      rebind(boxPlot, draw, 'context', 'lineWidth');
      return boxPlot;
    });

    var ohlc$2 = (() => ohlcBase$1(shapeOhlc(), 'ohlc'));

    var ohlc$3 = (() => ohlcBase$2(shapeOhlc()));

    var ohlc$4 = (() => ohlcBase$3(webglSeriesOhlc()));

    var multiBase = (() => {
      let series = [];

      let mapping = d => d;

      let key = (_, i) => i;

      const multi = createBase({
        decorate: () => {},
        xScale: d3Scale.scaleIdentity(),
        yScale: d3Scale.scaleIdentity()
      });

      multi.xValues = () => series.map(s => s.xValues()).reduce((a, b) => a.concat(b));

      multi.yValues = () => series.map(s => s.yValues()).reduce((a, b) => a.concat(b));

      multi.mapping = (...args) => {
        if (!args.length) {
          return mapping;
        }

        mapping = args[0];
        return multi;
      };

      multi.key = (...args) => {
        if (!args.length) {
          return key;
        }

        key = args[0];
        return multi;
      };

      multi.series = (...args) => {
        if (!args.length) {
          return series;
        }

        series = args[0];
        return multi;
      };

      return multi;
    });

    var seriesSvgMulti = (() => {
      const base = multiBase();
      const innerJoin = dataJoin('g');
      const join = dataJoin('g', 'multi');

      const multi = selection => {
        if (selection.selection) {
          join.transition(selection);
          innerJoin.transition(selection);
        }

        const mapping = base.mapping();
        const series = base.series();
        const xScale = base.xScale();
        const yScale = base.yScale();
        selection.each((data, index, group) => {
          const container = join(d3Selection.select(group[index]), series); // iterate over the containers, 'call'-ing the series for each

          container.each((dataSeries, seriesIndex, seriesGroup) => {
            dataSeries.xScale(xScale).yScale(yScale);
            const seriesData = mapping(data, seriesIndex, series);
            const innerContainer = innerJoin(d3Selection.select(seriesGroup[seriesIndex]), [seriesData]);
            innerContainer.call(dataSeries);
          });
          const unwrappedSelection = container.selection ? container.selection() : container;
          unwrappedSelection.order();
          base.decorate()(container, data, index);
        });
      };

      rebindAll(multi, base);
      rebind(multi, join, 'key');
      return multi;
    });

    var seriesCanvasMulti = (() => {
      let context = null;
      const base = multiBase();

      const multi = data => {
        const mapping = base.mapping();
        const series = base.series();
        const xScale = base.xScale();
        const yScale = base.yScale();
        series.forEach((dataSeries, index) => {
          const seriesData = mapping(data, index, series);
          dataSeries.context(context).xScale(xScale).yScale(yScale);
          let adaptedDecorate;

          if (dataSeries.decorate) {
            adaptedDecorate = dataSeries.decorate();
            dataSeries.decorate((c, d, i) => {
              base.decorate()(c, data, index);
              adaptedDecorate(c, d, i);
            });
          } else {
            base.decorate()(context, data, index);
          }

          dataSeries(seriesData);

          if (adaptedDecorate) {
            dataSeries.decorate(adaptedDecorate);
          }
        });
      };

      multi.context = (...args) => {
        if (!args.length) {
          return context;
        }

        context = args[0];
        return multi;
      };

      rebindAll(multi, base);
      return multi;
    });

    var groupedBase = (series => {
      let bandwidth = () => 50;

      let align = 'center'; // the offset scale is used to offset each of the series within a group

      const offsetScale = d3Scale.scaleBand();
      const grouped = createBase({
        decorate: () => {},
        xScale: d3Scale.scaleLinear(),
        yScale: d3Scale.scaleLinear()
      }); // the bandwidth for the grouped series can be a function of datum / index. As a result
      // the offset scale required to cluster the 'sub' series is also dependent on datum / index.
      // This function computes the offset scale for a specific datum / index of the grouped series

      grouped.offsetScaleForDatum = (data, d, i) => {
        const width = bandwidth(d, i);
        const offset = alignOffset(align, width);
        const halfWidth = width / 2;
        return offsetScale.domain(d3Array.range(0, data.length)).range([-halfWidth + offset, halfWidth + offset]);
      };

      grouped.bandwidth = (...args) => {
        if (!args.length) {
          return bandwidth;
        }

        bandwidth = functor$4(args[0]);
        return grouped;
      };

      grouped.align = (...args) => {
        if (!args.length) {
          return align;
        }

        align = args[0];
        return grouped;
      };

      rebindAll(grouped, offsetScale, includeMap({
        'paddingInner': 'paddingOuter'
      }));
      return grouped;
    });

    var grouped = (series => {
      const base = groupedBase();
      const join = dataJoin('g', 'grouped');

      const grouped = selection => {
        if (selection.selection) {
          join.transition(selection);
        }

        selection.each((data, index, group) => {
          const g = join(d3Selection.select(group[index]), data);
          g.enter().append('g');
          g.select('g').each((_, index, group) => {
            const container = d3Selection.select(group[index]); // create a composite scale that applies the required offset

            const isVertical = series.orient() !== 'horizontal';

            const compositeScale = (d, i) => {
              const offset = base.offsetScaleForDatum(data, d, i);
              const baseScale = isVertical ? base.xScale() : base.yScale();
              return baseScale(d) + offset(index) + offset.bandwidth() / 2;
            };

            if (isVertical) {
              series.xScale(compositeScale);
              series.yScale(base.yScale());
            } else {
              series.yScale(compositeScale);
              series.xScale(base.xScale());
            } // if the sub-series has a bandwidth, set this from the offset scale


            if (series.bandwidth) {
              series.bandwidth((d, i) => base.offsetScaleForDatum(data, d, i).bandwidth());
            } // adapt the decorate function to give each series the correct index


            series.decorate((s, d) => base.decorate()(s, d, index));
            container.call(series);
          });
        });
      };

      rebindAll(grouped, series, exclude('decorate', 'xScale', 'yScale'));
      rebindAll(grouped, base, exclude('offsetScaleForDatum'));
      return grouped;
    });

    function grouped$1 (series) {
      const base = groupedBase();

      const grouped = data => {
        data.forEach((seriesData, index) => {
          // create a composite scale that applies the required offset
          const isVertical = series.orient() !== 'horizontal';

          const compositeScale = (d, i) => {
            const offset = base.offsetScaleForDatum(data, d, i);
            const baseScale = isVertical ? base.xScale() : base.yScale();
            return baseScale(d) + offset(index) + offset.bandwidth() / 2;
          };

          if (isVertical) {
            series.xScale(compositeScale);
            series.yScale(base.yScale());
          } else {
            series.yScale(compositeScale);
            series.xScale(base.xScale());
          } // if the sub-series has a bandwidth, set this from the offset scale


          if (series.bandwidth) {
            series.bandwidth((d, i) => base.offsetScaleForDatum(data, d, i).bandwidth());
          } // adapt the decorate function to give each series the correct index


          series.decorate((c, d) => base.decorate()(c, d, index));
          series(seriesData);
        });
      };

      rebindAll(grouped, series, exclude('decorate', 'xScale', 'yScale'));
      rebindAll(grouped, base, exclude('offsetScaleForDatum'));
      return grouped;
    }

    var repeat = (() => {
      let orient = 'vertical';
      let series = seriesSvgLine();
      const multi = seriesSvgMulti();

      const repeat = selection => selection.each((data, index, group) => {
        if (orient === 'vertical') {
          multi.series(data[0].map(_ => series)).mapping((data, index) => data.map(d => d[index]));
        } else {
          multi.series(data.map(_ => series)).mapping((data, index) => data[index]);
        }

        d3Selection.select(group[index]).call(multi);
      });

      repeat.series = (...args) => {
        if (!args.length) {
          return series;
        }

        series = args[0];
        return repeat;
      };

      repeat.orient = (...args) => {
        if (!args.length) {
          return orient;
        }

        orient = args[0];
        return repeat;
      };

      rebindAll(repeat, multi, exclude('series', 'mapping'));
      return repeat;
    });

    var repeat$1 = (() => {
      let orient = 'vertical';
      let series = seriesCanvasLine();
      const multi = seriesCanvasMulti();

      const repeat = data => {
        if (orient === 'vertical') {
          multi.series(data[0].map(_ => series)).mapping((data, index) => data.map(d => d[index]));
        } else {
          multi.series(data.map(_ => series)).mapping((data, index) => data[index]);
        }

        multi(data);
      };

      repeat.series = (...args) => {
        if (!args.length) {
          return series;
        }

        series = args[0];
        return repeat;
      };

      repeat.orient = (...args) => {
        if (!args.length) {
          return orient;
        }

        orient = args[0];
        return repeat;
      };

      rebindAll(repeat, multi, exclude('series', 'mapping'));
      return repeat;
    });

    const sortUnique = arr => arr.sort(d3Array.ascending).filter((value, index, self) => self.indexOf(value, index + 1) === -1);

    var autoBandwidth = (adaptee => {
      let widthFraction = 0.75; // computes the bandwidth as a fraction of the smallest distance between the datapoints

      const computeBandwidth = screenValues => {
        // return some default value if there are not enough datapoints to compute the width
        if (screenValues.length <= 1) {
          return 10;
        }

        screenValues = sortUnique(screenValues); // compute the distance between neighbouring items

        const neighbourDistances = d3Array.pairs(screenValues).map(tuple => Math.abs(tuple[0] - tuple[1]));
        const minDistance = d3Array.min(neighbourDistances);
        return widthFraction * minDistance;
      };

      const determineBandwith = (crossScale, data, accessor) => {
        // if the cross-scale has a bandwidth function, i.e. it is a scaleBand, use
        // this to determine the width
        if (crossScale.bandwidth) {
          return crossScale.bandwidth();
        } else {
          // grouped series expect a nested array, which is flattened out
          const flattenedData = Array.isArray(data) ? [].concat(...data) : data; // obtain an array of points along the crossValue axis, mapped to screen coordinates.

          const crossValuePoints = flattenedData.filter(adaptee.defined()).map(accessor()).map(crossScale);
          const width = computeBandwidth(crossValuePoints);
          return width;
        }
      };

      const autoBandwidth = arg => {
        const computeWidth = data => {
          if (adaptee.xBandwidth && adaptee.yBandwidth) {
            adaptee.xBandwidth(determineBandwith(adaptee.xScale(), data, adaptee.xValue));
            adaptee.yBandwidth(determineBandwith(adaptee.yScale(), data, adaptee.yValue));
          } else {
            // if the series has an orient property, use this to determine the cross-scale, otherwise
            // assume it is the x-scale
            const crossScale = adaptee.orient && adaptee.orient() === 'horizontal' ? adaptee.yScale() : adaptee.xScale();
            adaptee.bandwidth(determineBandwith(crossScale, data, adaptee.crossValue));
          }
        };

        if (arg instanceof d3Selection.selection) {
          arg.each((data, index, group) => {
            computeWidth(data);
            adaptee(d3Selection.select(group[index]));
          });
        } else {
          computeWidth(arg);
          adaptee(arg);
        }
      };

      rebindAll(autoBandwidth, adaptee);

      autoBandwidth.widthFraction = (...args) => {
        if (!args.length) {
          return widthFraction;
        }

        widthFraction = args[0];
        return autoBandwidth;
      };

      return autoBandwidth;
    });

    var heatmapBase = (() => {
      let xValue = d => d.x;

      let yValue = d => d.y;

      let colorValue = d => d.color;

      let yBandwidth = () => 5;

      let xBandwidth = () => 5;

      let colorInterpolate = d3Scale.interpolateViridis;
      const heatmap = createBase({
        decorate: () => {},
        defined: (d, i) => defined(xValue, yValue, colorValue)(d, i),
        xScale: d3Scale.scaleIdentity(),
        yScale: d3Scale.scaleIdentity()
      });
      heatmap.pathGenerator = shapeBar().x(0).y(0);

      heatmap.colorScale = data => {
        const colorValues = data.map(colorValue); // a scale that maps the color values onto a unit range, [0, 1]

        return d3Scale.scaleLinear().domain([d3Array.min(colorValues), d3Array.max(colorValues)]);
      };

      heatmap.values = (d, i) => ({
        x: heatmap.xScale()(xValue(d, i)),
        y: heatmap.yScale()(yValue(d, i)),
        colorValue: colorValue(d, i),
        width: xBandwidth(d, i),
        height: yBandwidth(d, i)
      });

      heatmap.xValues = () => [xValue];

      heatmap.yValues = () => [yValue];

      heatmap.xValue = (...args) => {
        if (!args.length) {
          return xValue;
        }

        xValue = functor$4(args[0]);
        return heatmap;
      };

      heatmap.yValue = (...args) => {
        if (!args.length) {
          return yValue;
        }

        yValue = functor$4(args[0]);
        return heatmap;
      };

      heatmap.colorValue = (...args) => {
        if (!args.length) {
          return colorValue;
        }

        colorValue = functor$4(args[0]);
        return heatmap;
      };

      heatmap.colorInterpolate = (...args) => {
        if (!args.length) {
          return colorInterpolate;
        }

        colorInterpolate = args[0];
        return heatmap;
      };

      heatmap.xBandwidth = (...args) => {
        if (!args.length) {
          return xBandwidth;
        }

        xBandwidth = functor$4(args[0]);
        return heatmap;
      };

      heatmap.yBandwidth = (...args) => {
        if (!args.length) {
          return yBandwidth;
        }

        yBandwidth = functor$4(args[0]);
        return heatmap;
      };

      rebindAll(heatmap, heatmap.pathGenerator, includeMap({
        'horizontalAlign': 'xAlign',
        'verticalAlign': 'yAlign'
      }));
      return heatmap;
    });

    var heatmap = (() => {
      const base = heatmapBase();
      const join = dataJoin('g', 'box');

      const containerTransform = values => 'translate(' + values.x + ', ' + values.y + ')';

      const heatmap = selection => {
        selection.each((data, index, group) => {
          const filteredData = data.filter(base.defined());
          const colorValue = base.colorValue();
          const colorInterpolate = base.colorInterpolate();
          const colorScale = base.colorScale(filteredData);
          const g = join(d3Selection.select(group[index]), filteredData);
          g.enter().append('path').attr('stroke', 'transparent');
          g.attr('transform', (d, i) => containerTransform(base.values(d, i))).select('path').attr('d', (d, i) => base.pathGenerator.width(base.values(d, i).width).height(base.values(d, i).height)([d])).attr('fill', (d, i) => colorInterpolate(colorScale(colorValue(d, i))));
          base.decorate()(g, data, index);
        });
      };

      rebindAll(heatmap, base);
      return heatmap;
    });

    var heatmap$1 = (() => {
      const base = heatmapBase();

      const heatmap = data => {
        const filteredData = data.filter(base.defined());
        const colorInterpolate = base.colorInterpolate();
        const colorScale = base.colorScale(filteredData);
        const context = base.pathGenerator.context();
        filteredData.forEach((d, i) => {
          context.save();
          context.beginPath();
          const values = base.values(d, i);
          context.translate(values.x, values.y);
          context.fillStyle = colorInterpolate(colorScale(values.colorValue));
          context.strokeStyle = 'transparent';
          base.decorate()(context, d, i);
          base.pathGenerator.height(values.height).width(values.width)([d]);
          context.fill();
          context.stroke();
          context.closePath();
          context.restore();
        });
      };

      rebind(heatmap, base.pathGenerator, 'context');
      rebindAll(heatmap, base);
      return heatmap;
    });

    var constant = (value => typeof value === 'function' ? value : () => value);

    var band = (() => {
      let xScale = d3Scale.scaleIdentity();
      let yScale = d3Scale.scaleIdentity();
      let orient = 'horizontal';

      let fromValue = d => d.from;

      let toValue = d => d.to;

      let decorate = () => {};

      const join = dataJoin('g', 'annotation-band');
      const pathGenerator = shapeBar().horizontalAlign('center').verticalAlign('center').x(0).y(0);

      var instance = selection => {
        if (selection.selection) {
          join.transition(selection);
        }

        if (orient !== 'horizontal' && orient !== 'vertical') {
          throw new Error('Invalid orientation');
        }

        const horizontal = orient === 'horizontal';
        const translation = horizontal ? (a, b) => `translate(${a}, ${b})` : (a, b) => `translate(${b}, ${a})`; // the value scale which the annotation 'value' relates to, the crossScale
        // is the other. Which is which depends on the orienation!

        const crossScale = horizontal ? xScale : yScale;
        const valueScale = horizontal ? yScale : xScale;
        const crossScaleRange = crossScale.range();
        const crossScaleSize = crossScaleRange[1] - crossScaleRange[0];
        const valueAxisDimension = horizontal ? 'height' : 'width';
        const crossAxisDimension = horizontal ? 'width' : 'height';

        const containerTransform = (...args) => translation((crossScaleRange[1] + crossScaleRange[0]) / 2, (valueScale(toValue(...args)) + valueScale(fromValue(...args))) / 2);

        pathGenerator[crossAxisDimension](crossScaleSize);
        pathGenerator[valueAxisDimension]((...args) => valueScale(toValue(...args)) - valueScale(fromValue(...args)));
        selection.each((data, index, nodes) => {
          var g = join(d3Selection.select(nodes[index]), data);
          g.enter().attr('transform', containerTransform).append('path').classed('band', true);
          g.attr('class', `annotation-band ${orient}`).attr('transform', containerTransform).select('path') // the path generator is being used to render a single path, hence
          // an explicit index is provided
          .attr('d', (d, i) => pathGenerator([d], i));
          decorate(g, data, index);
        });
      };

      instance.xScale = (...args) => {
        if (!args.length) {
          return xScale;
        }

        xScale = args[0];
        return instance;
      };

      instance.yScale = (...args) => {
        if (!args.length) {
          return yScale;
        }

        yScale = args[0];
        return instance;
      };

      instance.orient = (...args) => {
        if (!args.length) {
          return orient;
        }

        orient = args[0];
        return instance;
      };

      instance.decorate = (...args) => {
        if (!args.length) {
          return decorate;
        }

        decorate = args[0];
        return instance;
      };

      instance.fromValue = (...args) => {
        if (!args.length) {
          return fromValue;
        }

        fromValue = constant(args[0]);
        return instance;
      };

      instance.toValue = (...args) => {
        if (!args.length) {
          return toValue;
        }

        toValue = constant(args[0]);
        return instance;
      };

      return instance;
    });

    var band$1 = (() => {
      let xScale = d3Scale.scaleIdentity();
      let yScale = d3Scale.scaleIdentity();
      let orient = 'horizontal';

      let fromValue = d => d.from;

      let toValue = d => d.to;

      let decorate = () => {};

      const pathGenerator = shapeBar().horizontalAlign('right').verticalAlign('top');

      var instance = data => {
        if (orient !== 'horizontal' && orient !== 'vertical') {
          throw new Error('Invalid orientation');
        }

        const context = pathGenerator.context();
        const horizontal = orient === 'horizontal'; // the value scale which the annotation 'value' relates to, the crossScale
        // is the other. Which is which depends on the orienation!

        const crossScale = horizontal ? xScale : yScale;
        const valueScale = horizontal ? yScale : xScale;
        const crossScaleRange = crossScale.range();
        const crossScaleSize = crossScaleRange[1] - crossScaleRange[0];
        const valueAxisStart = horizontal ? 'x' : 'y';
        const crossAxisStart = horizontal ? 'y' : 'x';
        const valueAxisDimension = horizontal ? 'height' : 'width';
        const crossAxisDimension = horizontal ? 'width' : 'height';
        data.forEach((d, i) => {
          context.save();
          context.beginPath();
          context.strokeStyle = 'transparent';
          pathGenerator[crossAxisStart](valueScale(fromValue(d)));
          pathGenerator[valueAxisStart](crossScaleRange[0]);
          pathGenerator[crossAxisDimension](crossScaleSize);
          pathGenerator[valueAxisDimension](valueScale(toValue(d)) - valueScale(fromValue(d)));
          decorate(context, d, i);
          pathGenerator.context(context)([d], i);
          context.fill();
          context.stroke();
          context.closePath();
          context.restore();
        });
      };

      instance.xScale = (...args) => {
        if (!args.length) {
          return xScale;
        }

        xScale = args[0];
        return instance;
      };

      instance.yScale = (...args) => {
        if (!args.length) {
          return yScale;
        }

        yScale = args[0];
        return instance;
      };

      instance.orient = (...args) => {
        if (!args.length) {
          return orient;
        }

        orient = args[0];
        return instance;
      };

      instance.decorate = (...args) => {
        if (!args.length) {
          return decorate;
        }

        decorate = args[0];
        return instance;
      };

      instance.fromValue = (...args) => {
        if (!args.length) {
          return fromValue;
        }

        fromValue = constant(args[0]);
        return instance;
      };

      instance.toValue = (...args) => {
        if (!args.length) {
          return toValue;
        }

        toValue = constant(args[0]);
        return instance;
      };

      rebind(instance, pathGenerator, 'context');
      return instance;
    });

    var annotationLine = (() => {
      let xScale = d3Scale.scaleIdentity();
      let yScale = d3Scale.scaleIdentity();

      let value = d => d;

      let label = value;

      let decorate = () => {};

      let orient = 'horizontal';
      const join = dataJoin('g', 'annotation-line');

      const instance = selection => {
        if (selection.selection) {
          join.transition(selection);
        }

        if (orient !== 'horizontal' && orient !== 'vertical') {
          throw new Error('Invalid orientation');
        }

        const horizontal = orient === 'horizontal';
        const translation = horizontal ? (a, b) => `translate(${a}, ${b})` : (a, b) => `translate(${b}, ${a})`;
        const lineProperty = horizontal ? 'x2' : 'y2'; // the value scale which the annotation 'value' relates to, the crossScale
        // is the other. Which is which depends on the orienation!

        const crossScale = horizontal ? xScale : yScale;
        const valueScale = horizontal ? yScale : xScale;
        const handleOne = horizontal ? 'left-handle' : 'bottom-handle';
        const handleTwo = horizontal ? 'right-handle' : 'top-handle';
        const textOffsetX = horizontal ? '9' : '0';
        const textOffsetY = horizontal ? '0' : '9';
        const textOffsetDeltaY = horizontal ? '0.32em' : '0.71em';
        const textAnchor = horizontal ? 'start' : 'middle';
        const scaleRange = crossScale.range(); // the transform that sets the 'origin' of the annotation

        const containerTransform = (...args) => translation(scaleRange[0], valueScale(value(...args)));

        const scaleWidth = scaleRange[1] - scaleRange[0];
        selection.each((data, selectionIndex, nodes) => {
          const g = join(d3Selection.select(nodes[selectionIndex]), data); // create the outer container and line

          const enter = g.enter().attr('transform', containerTransform).style('stroke', '#bbb');
          enter.append('line').attr(lineProperty, scaleWidth); // create containers at each end of the annotation

          enter.append('g').classed(handleOne, true).style('stroke', 'none');
          enter.append('g').classed(handleTwo, true).style('stroke', 'none').attr('transform', translation(scaleWidth, 0)).append('text').attr('text-anchor', textAnchor).attr('x', textOffsetX).attr('y', textOffsetY).attr('dy', textOffsetDeltaY); // Update

          g.attr('class', `annotation-line ${orient}`); // translate the parent container to the left hand edge of the annotation

          g.attr('transform', containerTransform); // update the elements that depend on scale width

          g.select('line').attr(lineProperty, scaleWidth);
          g.select('g.' + handleTwo).attr('transform', translation(scaleWidth, 0)); // Update the text label

          g.select('text').text(label);
          decorate(g, data, selectionIndex);
        });
      };

      instance.xScale = (...args) => {
        if (!args.length) {
          return xScale;
        }

        xScale = args[0];
        return instance;
      };

      instance.yScale = (...args) => {
        if (!args.length) {
          return yScale;
        }

        yScale = args[0];
        return instance;
      };

      instance.value = (...args) => {
        if (!args.length) {
          return value;
        }

        value = constant(args[0]);
        return instance;
      };

      instance.label = (...args) => {
        if (!args.length) {
          return label;
        }

        label = constant(args[0]);
        return instance;
      };

      instance.decorate = (...args) => {
        if (!args.length) {
          return decorate;
        }

        decorate = args[0];
        return instance;
      };

      instance.orient = (...args) => {
        if (!args.length) {
          return orient;
        }

        orient = args[0];
        return instance;
      };

      return instance;
    });

    function crosshair () {
      let x = d => d.x;

      let y = d => d.y;

      let xScale = d3Scale.scaleIdentity();
      let yScale = d3Scale.scaleIdentity();

      let decorate = () => {};

      const join = dataJoin('g', 'annotation-crosshair');
      const point = seriesSvgPoint();
      const horizontalLine = annotationLine();
      const verticalLine = annotationLine().orient('vertical'); // The line annotations and point series used to render the crosshair are positioned using
      // screen coordinates. This function constructs an identity scale for these components.

      const xIdentity = d3Scale.scaleIdentity();
      const yIdentity = d3Scale.scaleIdentity();
      const multi = seriesSvgMulti().series([horizontalLine, verticalLine, point]).xScale(xIdentity).yScale(yIdentity).mapping(data => [data]);

      const instance = selection => {
        if (selection.selection) {
          join.transition(selection);
        }

        selection.each((data, index, nodes) => {
          const g = join(d3Selection.select(nodes[index]), data); // Prevent the crosshair triggering pointer events on itself

          g.enter().style('pointer-events', 'none'); // Assign the identity scales an accurate range to allow the line annotations to cover
          // the full width/height of the chart.

          xIdentity.range(xScale.range());
          yIdentity.range(yScale.range());
          point.crossValue(x).mainValue(y);
          horizontalLine.value(y);
          verticalLine.value(x);
          g.call(multi);
          decorate(g, data, index);
        });
      }; // Don't use the xValue/yValue convention to indicate that these values are in screen
      // not domain co-ordinates and are therefore not scaled.


      instance.x = (...args) => {
        if (!args.length) {
          return x;
        }

        x = args[0];
        return instance;
      };

      instance.y = (...args) => {
        if (!args.length) {
          return y;
        }

        y = args[0];
        return instance;
      };

      instance.xScale = (...args) => {
        if (!args.length) {
          return xScale;
        }

        xScale = args[0];
        return instance;
      };

      instance.yScale = (...args) => {
        if (!args.length) {
          return yScale;
        }

        yScale = args[0];
        return instance;
      };

      instance.decorate = (...args) => {
        if (!args.length) {
          return decorate;
        }

        decorate = args[0];
        return instance;
      };

      const lineIncludes = include('label');
      rebindAll(instance, horizontalLine, lineIncludes, prefix('y'));
      rebindAll(instance, verticalLine, lineIncludes, prefix('x'));
      return instance;
    }

    var annotationLine$1 = (() => {
      let xScale = d3Scale.scaleIdentity();
      let yScale = d3Scale.scaleIdentity();

      let value = d => d;

      let label = value;

      let decorate = () => {};

      let orient = 'horizontal';
      const lineData = d3Shape.line();

      const instance = data => {
        if (orient !== 'horizontal' && orient !== 'vertical') {
          throw new Error('Invalid orientation');
        }

        const horizontal = orient === 'horizontal';
        const context = lineData.context(); // the value scale which the annotation 'value' relates to, the crossScale
        // is the other. Which is which depends on the orienation!

        const crossScale = horizontal ? xScale : yScale;
        const valueScale = horizontal ? yScale : xScale;
        const crossDomain = crossScale.domain();
        const textOffsetX = horizontal ? 9 : 0;
        const textOffsetY = horizontal ? 0 : 9;
        const textAlign = horizontal ? 'left' : 'center';
        const textBaseline = horizontal ? 'middle' : 'hanging';
        data.forEach((d, i) => {
          context.save();
          context.beginPath();
          context.strokeStyle = '#bbb';
          context.fillStyle = '#000';
          context.textAlign = textAlign;
          context.textBaseline = textBaseline;
          decorate(context, d, i); // Draw line

          lineData.context(context)(crossDomain.map(extent => {
            const point = [crossScale(extent), valueScale(value(d))];
            return horizontal ? point : point.reverse();
          })); // Draw label

          const x = horizontal ? crossScale(crossDomain[1]) : valueScale(value(d));
          const y = horizontal ? valueScale(value(d)) : crossScale(crossDomain[1]);
          context.fillText(label(d), x + textOffsetX, y + textOffsetY);
          context.fill();
          context.stroke();
          context.closePath();
          context.restore();
        });
      };

      instance.xScale = (...args) => {
        if (!args.length) {
          return xScale;
        }

        xScale = args[0];
        return instance;
      };

      instance.yScale = (...args) => {
        if (!args.length) {
          return yScale;
        }

        yScale = args[0];
        return instance;
      };

      instance.value = (...args) => {
        if (!args.length) {
          return value;
        }

        value = constant(args[0]);
        return instance;
      };

      instance.label = (...args) => {
        if (!args.length) {
          return label;
        }

        label = constant(args[0]);
        return instance;
      };

      instance.decorate = (...args) => {
        if (!args.length) {
          return decorate;
        }

        decorate = args[0];
        return instance;
      };

      instance.orient = (...args) => {
        if (!args.length) {
          return orient;
        }

        orient = args[0];
        return instance;
      };

      rebind(instance, lineData, 'context');
      return instance;
    });

    var crosshair$1 = (() => {
      let x = d => d.x;

      let y = d => d.y;

      let xScale = d3Scale.scaleIdentity();
      let yScale = d3Scale.scaleIdentity();
      const point = seriesCanvasPoint();
      const horizontalLine = annotationLine$1();
      const verticalLine = annotationLine$1().orient('vertical'); // The line annotations and point series used to render the crosshair are positioned using
      // screen coordinates. This function constructs an identity scale for these components.

      const xIdentity = d3Scale.scaleIdentity();
      const yIdentity = d3Scale.scaleIdentity();
      const multi = seriesCanvasMulti().series([horizontalLine, verticalLine, point]).xScale(xIdentity).yScale(yIdentity).mapping(data => [data]);

      const instance = data => {
        data.forEach(d => {
          // Assign the identity scales an accurate range to allow the line annotations to cover
          // the full width/height of the chart.
          xIdentity.range(xScale.range());
          yIdentity.range(yScale.range());
          point.crossValue(x).mainValue(y);
          horizontalLine.value(y);
          verticalLine.value(x);
          multi(d);
        });
      }; // Don't use the xValue/yValue convention to indicate that these values are in screen
      // not domain co-ordinates and are therefore not scaled.


      instance.x = (...args) => {
        if (!args.length) {
          return x;
        }

        x = args[0];
        return instance;
      };

      instance.y = (...args) => {
        if (!args.length) {
          return y;
        }

        y = args[0];
        return instance;
      };

      instance.xScale = (...args) => {
        if (!args.length) {
          return xScale;
        }

        xScale = args[0];
        return instance;
      };

      instance.yScale = (...args) => {
        if (!args.length) {
          return yScale;
        }

        yScale = args[0];
        return instance;
      };

      const lineIncludes = include('label', 'decorate');
      rebindAll(instance, horizontalLine, lineIncludes, prefix('y'));
      rebindAll(instance, verticalLine, lineIncludes, prefix('x'));
      rebind(instance, point, 'decorate');
      rebind(instance, multi, 'context');
      return instance;
    });

    var ticks = (() => {
      let scale = d3Scale.scaleIdentity();
      let tickArguments = [10];
      let tickValues = null;

      const ticks = () => tickValues != null ? tickValues : scale.ticks ? scale.ticks(...tickArguments) : scale.domain();

      ticks.scale = (...args) => {
        if (!args.length) {
          return scale;
        }

        scale = args[0];
        return ticks;
      };

      ticks.ticks = (...args) => {
        tickArguments = args;
        return ticks;
      };

      ticks.tickArguments = (...args) => {
        if (!args.length) {
          return tickArguments;
        }

        tickArguments = args[0];
        return ticks;
      };

      ticks.tickValues = (...args) => {
        if (!args.length) {
          return tickValues;
        }

        tickValues = args[0];
        return ticks;
      };

      return ticks;
    });

    const identity$3 = d => d;

    var gridline = (() => {
      let xDecorate = () => {};

      let yDecorate = () => {};

      const xTicks = ticks();
      const yTicks = ticks();
      const xJoin = dataJoin('line', 'gridline-y').key(identity$3);
      const yJoin = dataJoin('line', 'gridline-x').key(identity$3);

      const instance = selection => {
        if (selection.selection) {
          xJoin.transition(selection);
          yJoin.transition(selection);
        }

        selection.each((data, index, nodes) => {
          const element = nodes[index];
          const container = d3Selection.select(nodes[index]);
          const xScale = xTicks.scale();
          const yScale = yTicks.scale(); // Stash a snapshot of the scale, and retrieve the old snapshot.

          const xScaleOld = element.__x_scale__ || xScale;
          element.__x_scale__ = xScale.copy();
          const xData = xTicks();
          const xLines = xJoin(container, xData);
          xLines.enter().attr('x1', xScaleOld).attr('x2', xScaleOld).attr('y1', yScale.range()[0]).attr('y2', yScale.range()[1]);
          xLines.attr('x1', xScale).attr('x2', xScale).attr('y1', yScale.range()[0]).attr('y2', yScale.range()[1]).attr('stroke', '#bbb');
          xLines.exit().attr('x1', xScale).attr('x2', xScale);
          xDecorate(xLines, xData, index); // Stash a snapshot of the scale, and retrieve the old snapshot.

          const yScaleOld = element.__y_scale__ || yScale;
          element.__y_scale__ = yScale.copy();
          const yData = yTicks();
          const yLines = yJoin(container, yData);
          yLines.enter().attr('y1', yScaleOld).attr('y2', yScaleOld).attr('x1', xScale.range()[0]).attr('x2', xScale.range()[1]);
          yLines.attr('y1', yScale).attr('y2', yScale).attr('x1', xScale.range()[0]).attr('x2', xScale.range()[1]).attr('stroke', '#bbb');
          yLines.exit().attr('y1', yScale).attr('y2', yScale);
          yDecorate(yLines, yData, index);
        });
      };

      instance.yDecorate = (...args) => {
        if (!args.length) {
          return yDecorate;
        }

        yDecorate = args[0];
        return instance;
      };

      instance.xDecorate = (...args) => {
        if (!args.length) {
          return xDecorate;
        }

        xDecorate = args[0];
        return instance;
      };

      rebindAll(instance, xJoin, includeMap({
        'key': 'xKey'
      }));
      rebindAll(instance, yJoin, includeMap({
        'key': 'yKey'
      }));
      rebindAll(instance, xTicks, prefix('x'));
      rebindAll(instance, yTicks, prefix('y'));
      return instance;
    });

    var gridline$1 = (() => {
      let xDecorate = () => {};

      let yDecorate = () => {};

      const xTicks = ticks();
      const yTicks = ticks();
      const lineData = d3Shape.line();

      const instance = () => {
        const context = lineData.context();
        const xScale = xTicks.scale();
        const yScale = yTicks.scale();
        xTicks().forEach((xTick, i) => {
          context.save();
          context.beginPath();
          context.strokeStyle = '#bbb';
          context.fillStyle = 'transparent';
          xDecorate(context, xTick, i);
          lineData.context(context)(yScale.domain().map(d => [xScale(xTick), yScale(d)]));
          context.fill();
          context.stroke();
          context.closePath();
          context.restore();
        });
        yTicks().forEach((yTick, i) => {
          context.save();
          context.beginPath();
          context.strokeStyle = '#bbb';
          context.fillStyle = 'transparent';
          yDecorate(context, yTick, i);
          lineData.context(context)(xScale.domain().map(d => [xScale(d), yScale(yTick)]));
          context.fill();
          context.stroke();
          context.closePath();
          context.restore();
        });
      };

      instance.yDecorate = (...args) => {
        if (!args.length) {
          return yDecorate;
        }

        yDecorate = args[0];
        return instance;
      };

      instance.xDecorate = (...args) => {
        if (!args.length) {
          return xDecorate;
        }

        xDecorate = args[0];
        return instance;
      };

      rebindAll(instance, xTicks, prefix('x'));
      rebindAll(instance, yTicks, prefix('y'));
      rebind(instance, lineData, 'context');
      return instance;
    });

    const identity$4 = d => d;

    const axisBase = (orient, scale, custom = {}) => {
      let tickArguments = [10];
      let tickValues = null;

      let decorate = () => {};

      let tickFormat = null;
      let tickSizeOuter = 6;
      let tickSizeInner = 6;
      let tickPadding = 3;
      const svgDomainLine = d3Shape.line();

      const dataJoin$1 = dataJoin('g', 'tick').key(identity$4);

      const domainPathDataJoin = dataJoin('path', 'domain');

      const defaultLabelOffset = () => ({
        offset: [0, tickSizeInner + tickPadding]
      });

      const defaultTickPath = () => ({
        path: [[0, 0], [0, tickSizeInner]]
      });

      const labelOffset = custom.labelOffset || defaultLabelOffset;
      const tickPath = custom.tickPath || defaultTickPath; // returns a function that creates a translation based on
      // the bound data

      const containerTranslate = (scale, trans) => {
        let offset = 0;

        if (scale.bandwidth) {
          offset = scale.bandwidth() / 2;

          if (scale.round()) {
            offset = Math.round(offset);
          }
        }

        return d => trans(scale(d) + offset, 0);
      };

      const translate = (x, y) => isVertical() ? `translate(${y}, ${x})` : `translate(${x}, ${y})`;

      const pathTranspose = arr => isVertical() ? arr.map(d => [d[1], d[0]]) : arr;

      const isVertical = () => orient === 'left' || orient === 'right';

      const tryApply = (fn, args, defaultVal) => scale[fn] ? scale[fn].apply(scale, args) : defaultVal;

      const axis = selection => {
        if (selection.selection) {
          dataJoin$1.transition(selection);
          domainPathDataJoin.transition(selection);
        }

        selection.each((data, index, group) => {
          const element = group[index];
          const container = d3Selection.select(element);

          if (!element.__scale__) {
            container.attr('fill', 'none').attr('font-size', 10).attr('font-family', 'sans-serif').attr('text-anchor', orient === 'right' ? 'start' : orient === 'left' ? 'end' : 'middle');
          } // Stash a snapshot of the new scale, and retrieve the old snapshot.


          const scaleOld = element.__scale__ || scale;
          element.__scale__ = scale.copy();
          const ticksArray = tickValues == null ? tryApply('ticks', tickArguments, scale.domain()) : tickValues;
          const tickFormatter = tickFormat == null ? tryApply('tickFormat', tickArguments, identity$4) : tickFormat;
          const sign = orient === 'bottom' || orient === 'right' ? 1 : -1;

          const withSign = ([x, y]) => [x, sign * y]; // add the domain line


          const range = scale.range();
          const domainPathData = pathTranspose([[range[0], sign * tickSizeOuter], [range[0], 0], [range[1], 0], [range[1], sign * tickSizeOuter]]);
          const domainLine = domainPathDataJoin(container, [data]);
          domainLine.attr('d', svgDomainLine(domainPathData)).attr('stroke', '#000');
          const g = dataJoin$1(container, ticksArray);
          const labelOffsets = ticksArray.map((d, i) => labelOffset(d, i, ticksArray));
          const tickPaths = ticksArray.map((d, i) => tickPath(d, i, ticksArray)); // enter

          g.enter().attr('transform', containerTranslate(scaleOld, translate)).append('path').attr('stroke', '#000');
          g.enter().append('text').attr('transform', (d, i) => translate(...withSign(labelOffsets[i].offset))).attr('fill', '#000'); // exit

          g.exit().attr('transform', containerTranslate(scale, translate)); // update

          g.select('path').attr('visibility', (d, i) => tickPaths[i].hidden && 'hidden').attr('d', (d, i) => svgDomainLine(pathTranspose(tickPaths[i].path.map(withSign))));
          g.select('text').attr('visibility', (d, i) => labelOffsets[i].hidden && 'hidden').attr('transform', (d, i) => translate(...withSign(labelOffsets[i].offset))).attr('dy', () => {
            let offset = '0em';

            if (isVertical()) {
              offset = '0.32em';
            } else if (orient === 'bottom') {
              offset = '0.71em';
            }

            return offset;
          }).text(tickFormatter);
          g.attr('transform', containerTranslate(scale, translate));
          decorate(g, data, index);
        });
      };

      axis.tickFormat = (...args) => {
        if (!args.length) {
          return tickFormat;
        }

        tickFormat = args[0];
        return axis;
      };

      axis.tickSize = (...args) => {
        if (!args.length) {
          return tickSizeInner;
        }

        tickSizeInner = tickSizeOuter = Number(args[0]);
        return axis;
      };

      axis.tickSizeInner = (...args) => {
        if (!args.length) {
          return tickSizeInner;
        }

        tickSizeInner = Number(args[0]);
        return axis;
      };

      axis.tickSizeOuter = (...args) => {
        if (!args.length) {
          return tickSizeOuter;
        }

        tickSizeOuter = Number(args[0]);
        return axis;
      };

      axis.tickPadding = (...args) => {
        if (!args.length) {
          return tickPadding;
        }

        tickPadding = args[0];
        return axis;
      };

      axis.decorate = (...args) => {
        if (!args.length) {
          return decorate;
        }

        decorate = args[0];
        return axis;
      };

      axis.scale = (...args) => {
        if (!args.length) {
          return scale;
        }

        scale = args[0];
        return axis;
      };

      axis.ticks = (...args) => {
        tickArguments = [...args];
        return axis;
      };

      axis.tickArguments = (...args) => {
        if (!args.length) {
          return tickArguments.slice();
        }

        tickArguments = args[0] == null ? [] : [...args[0]];
        return axis;
      };

      axis.tickValues = (...args) => {
        if (!args.length) {
          return tickValues.slice();
        }

        tickValues = args[0] == null ? [] : [...args[0]];
        return axis;
      };

      axis.orient = () => orient;

      return axis;
    };

    const axis = (orient, scale) => {
      let tickCenterLabel = false;

      const labelOffset = (tick, index, ticksArray) => {
        let x = 0;
        let y = base.tickSizeInner() + base.tickPadding();
        let hidden = false;

        if (tickCenterLabel) {
          const thisPosition = scale(tick);
          const nextPosition = index < ticksArray.length - 1 ? scale(ticksArray[index + 1]) : scale.range()[1];
          x = (nextPosition - thisPosition) / 2;
          y = base.tickPadding();
          hidden = index === ticksArray.length - 1 && thisPosition === nextPosition;
        }

        return {
          offset: [x, y],
          hidden
        };
      };

      const base = axisBase(orient, scale, {
        labelOffset
      });

      const axis = selection => {
        return base(selection);
      };

      axis.tickCenterLabel = (...args) => {
        if (!args.length) {
          return tickCenterLabel;
        }

        tickCenterLabel = args[0];
        return axis;
      };

      rebindAll(axis, base);
      return axis;
    };

    const axisTop = scale => axis('top', scale);
    const axisBottom = scale => axis('bottom', scale);
    const axisLeft = scale => axis('left', scale);
    const axisRight = scale => axis('right', scale);

    const axisOrdinal = (orient, scale) => {
      let tickOffset = null;

      const step = (tick, index, ticksArray) => {
        if (scale.step) {
          // Use the scale step size
          return scale.step();
        }

        const thisPosition = scale(tick);

        if (index < ticksArray.length - 1) {
          // Distance between ticks
          return scale(ticksArray[index + 1]) / thisPosition;
        } else {
          // 2* distance to end
          return (scale.range()[1] - thisPosition) * 2;
        }
      };

      const tickPath = (tick, index, ticksArray) => {
        let x = 0;

        if (tickOffset) {
          x = tickOffset(tick, index);
        } else {
          x = step(tick, index, ticksArray) / 2;
        }

        return {
          path: [[x, 0], [x, base.tickSizeInner()]],
          hidden: index === ticksArray.length - 1
        };
      };

      const labelOffset = () => {
        // Don't include the tickSizeInner in the label positioning
        return {
          offset: [0, base.tickPadding()]
        };
      };

      const base = axisBase(orient, scale, {
        labelOffset,
        tickPath
      });

      const axis = selection => {
        base(selection);
      };

      axis.tickOffset = (...args) => {
        if (!args.length) {
          return tickOffset;
        }

        tickOffset = args[0];
        return axis;
      };

      rebindAll(axis, base);
      return axis;
    };

    const axisOrdinalTop = scale => axisOrdinal('top', scale);
    const axisOrdinalBottom = scale => axisOrdinal('bottom', scale);
    const axisOrdinalLeft = scale => axisOrdinal('left', scale);
    const axisOrdinalRight = scale => axisOrdinal('right', scale);

    var measureLabels = (scale => {
      const measure = selection => {
        const labels = scale['ticks'] ? scale.ticks() : scale.domain();
        const tester = selection.append('text');
        const boundingBoxes = labels.map(l => tester.text(l).node().getBBox());
        const maxHeight = Math.max(...boundingBoxes.map(b => b.height));
        const maxWidth = Math.max(...boundingBoxes.map(b => b.width));
        tester.remove();
        return {
          maxHeight,
          maxWidth,
          labelCount: labels.length
        };
      };

      return measure;
    });

    var axisLabelRotate = (adaptee => {
      let labelRotate = 'auto';

      let decorate = () => {};

      const isVertical = () => adaptee.orient() === 'left' || adaptee.orient() === 'right';

      const sign = () => adaptee.orient() === 'top' || adaptee.orient() === 'left' ? -1 : 1;

      const labelAnchor = () => {
        switch (adaptee.orient()) {
          case 'top':
          case 'right':
            return 'start';

          default:
            return 'end';
        }
      };

      const calculateRotation = s => {
        const {
          maxHeight,
          maxWidth,
          labelCount
        } = measureLabels(adaptee.scale())(s);
        const measuredSize = labelCount * maxWidth; // The more the overlap, the more we rotate

        let rotate;

        if (labelRotate === 'auto') {
          const range = adaptee.scale().range()[1];
          rotate = range < measuredSize ? 90 * Math.min(1, (measuredSize / range - 0.8) / 2) : 0;
        } else {
          rotate = labelRotate;
        }

        return {
          rotate: isVertical() ? Math.floor(sign() * (90 - rotate)) : Math.floor(-rotate),
          maxHeight,
          maxWidth,
          anchor: rotate ? labelAnchor() : 'middle'
        };
      };

      const decorateRotation = sel => {
        const {
          rotate,
          maxHeight,
          anchor
        } = calculateRotation(sel);
        const text = sel.select('text');
        const existingTransform = text.attr('transform');
        const offset = sign() * Math.floor(maxHeight / 2);
        const offsetTransform = isVertical() ? `translate(${offset}, 0)` : `translate(0, ${offset})`;
        text.style('text-anchor', anchor).attr('transform', `${existingTransform} ${offsetTransform} rotate(${rotate} 0 0)`);
      };

      const axisLabelRotate = arg => {
        adaptee(arg);
      };

      adaptee.decorate(s => {
        decorateRotation(s);
        decorate(s);
      });

      axisLabelRotate.decorate = (...args) => {
        if (!args.length) {
          return decorate;
        }

        decorate = args[0];
        return axisLabelRotate;
      };

      axisLabelRotate.labelRotate = (...args) => {
        if (!args.length) {
          return labelRotate;
        }

        labelRotate = args[0];
        return axisLabelRotate;
      };

      rebindAll(axisLabelRotate, adaptee, exclude('decorate'));
      return axisLabelRotate;
    });

    var axisLabelOffset = (adaptee => {
      let labelOffsetDepth = 'auto';

      let decorate = () => {};

      const isVertical = () => adaptee.orient() === 'left' || adaptee.orient() === 'right';

      const sign = () => adaptee.orient() === 'top' || adaptee.orient() === 'left' ? -1 : 1;

      const decorateOffset = sel => {
        const {
          maxHeight,
          maxWidth,
          labelCount
        } = measureLabels(adaptee.scale())(sel);
        const range = adaptee.scale().range()[1];
        const offsetLevels = labelOffsetDepth === 'auto' ? Math.floor((isVertical() ? maxHeight : maxWidth) * labelCount / range) + 1 : labelOffsetDepth;
        const text = sel.select('text');
        const existingTransform = text.attr('transform');

        const transform = i => isVertical() ? `translate(${i % offsetLevels * maxWidth * sign()}, 0)` : `translate(0, ${i % offsetLevels * maxHeight * sign()})`;

        text.attr('transform', (_, i) => `${existingTransform} ${transform(i)}`);
      };

      const axisLabelOffset = arg => adaptee(arg);

      adaptee.decorate(s => {
        decorateOffset(s);
        decorate(s);
      });

      axisLabelOffset.decorate = (...args) => {
        if (!args.length) {
          return decorate;
        }

        decorate = args[0];
        return axisLabelOffset;
      };

      axisLabelOffset.labelOffsetDepth = (...args) => {
        if (!args.length) {
          return labelOffsetDepth;
        }

        labelOffsetDepth = args[0];
        return axisLabelOffset;
      };

      rebindAll(axisLabelOffset, adaptee, exclude('decorate'));
      return axisLabelOffset;
    });

    const key = '__d3fc-elements__';
    const get = element => element[key] || {};
    const set = (element, data) => void (element[key] = data);
    const clear = element => delete element[key];

    const find = element => element.tagName === 'D3FC-GROUP' ? [element, ...element.querySelectorAll('d3fc-canvas, d3fc-group, d3fc-svg')] : [element];

    const measure = element => {
      const {
        width: previousWidth,
        height: previousHeight
      } = get(element);
      const pixelRatio = element.useDevicePixelRatio && window.devicePixelRatio != null ? window.devicePixelRatio : 1;
      const width = element.clientWidth * pixelRatio;
      const height = element.clientHeight * pixelRatio;
      const resized = width !== previousWidth || height !== previousHeight;
      set(element, {
        pixelRatio,
        width,
        height,
        resized
      });
    };

    if (typeof CustomEvent !== 'function') {
      throw new Error('d3fc-element depends on CustomEvent. Make sure that you load a polyfill in older browsers. See README.');
    }

    const resize = element => {
      const detail = get(element);
      const event = new CustomEvent('measure', {
        detail
      });
      element.dispatchEvent(event);
    };

    const draw = element => {
      const detail = get(element);
      const event = new CustomEvent('draw', {
        detail
      });
      element.dispatchEvent(event);
    };

    var redraw = (elements => {
      const allElements = elements.map(find).reduce((a, b) => a.concat(b));
      allElements.forEach(measure);
      allElements.forEach(resize);
      allElements.forEach(draw);
    });

    const getQueue = element => get(element.ownerDocument).queue || [];

    const setQueue = (element, queue) => {
      let {
        requestId
      } = get(element.ownerDocument);

      if (requestId == null) {
        requestId = requestAnimationFrame(() => {
          // This seems like a weak way of retrieving the queue
          // but I can't see an edge case at the minute...
          const queue = getQueue(element);
          redraw(queue);
          clearQueue(element);
        });
      }

      set(element.ownerDocument, {
        queue,
        requestId
      });
    };

    const clearQueue = element => clear(element.ownerDocument);

    const isDescendentOf = (element, ancestor) => {
      let node = element;

      do {
        if (node.parentNode === ancestor) {
          return true;
        } // eslint-disable-next-line no-cond-assign

      } while (node = node.parentNode);

      return false;
    };

    var requestRedraw = (element => {
      const queue = getQueue(element);
      const queueContainsElement = queue.indexOf(element) > -1;

      if (queueContainsElement) {
        return;
      }

      const queueContainsAncestor = queue.some(queuedElement => isDescendentOf(element, queuedElement));

      if (queueContainsAncestor) {
        return;
      }

      const queueExcludingDescendents = queue.filter(queuedElement => !isDescendentOf(queuedElement, element));
      queueExcludingDescendents.push(element);
      setQueue(element, queueExcludingDescendents);
    });

    if (typeof HTMLElement !== 'function') {
      throw new Error('d3fc-element depends on Custom Elements (v1). Make sure that you load a polyfill in older browsers. See README.');
    }

    const addMeasureListener = element => {
      if (element.__measureListener__ != null) {
        return;
      }

      element.__measureListener__ = event => element.setMeasurements(event.detail);

      element.addEventListener('measure', element.__measureListener__);
    };

    const removeMeasureListener = element => {
      if (element.__measureListener__ == null) {
        return;
      }

      element.removeEventListener('measure', element.__measureListener__);
      element.__measureListener__ = null;
    };

    var element = ((createNode, applyMeasurements) => class extends HTMLElement {
      static get observedAttributes() {
        return ['use-device-pixel-ratio'];
      }

      attributeChangedCallback(name) {
        switch (name) {
          case 'use-device-pixel-ratio':
            this.requestRedraw();
            break;
        }
      }

      connectedCallback() {
        if (this.childNodes.length === 0) {
          this.appendChild(createNode());
        }

        addMeasureListener(this);
      }

      disconnectedCallback() {
        removeMeasureListener(this);
      }

      setMeasurements({
        width,
        height
      }) {
        const {
          childNodes: [node, ...other]
        } = this;

        if (other.length > 0) {
          throw new Error('A d3fc-svg/canvas element must only contain a single svg/canvas element.');
        }

        applyMeasurements(this, node, {
          width,
          height
        });
      }

      get useDevicePixelRatio() {
        return this.hasAttribute('use-device-pixel-ratio') && this.getAttribute('use-device-pixel-ratio') !== 'false';
      }

      set useDevicePixelRatio(useDevicePixelRatio) {
        if (useDevicePixelRatio && !this.useDevicePixelRatio) {
          this.setAttribute('use-device-pixel-ratio', '');
        } else if (!useDevicePixelRatio && this.useDevicePixelRatio) {
          this.removeAttribute('use-device-pixel-ratio');
        }

        this.requestRedraw();
      }

      requestRedraw() {
        requestRedraw(this);
      }

    });

    class Canvas extends element(() => document.createElement('canvas'), (element, node, {
      width,
      height
    }) => {
      node.setAttribute('width', width);
      node.setAttribute('height', height);

      if (element.setWebglViewport) {
        const context = node.getContext('webgl');
        context.viewport(0, 0, width, height);
      }
    }) {
      get setWebglViewport() {
        return this.hasAttribute('set-webgl-viewport') && this.getAttribute('set-webgl-viewport') !== 'false';
      }

      set setWebglViewport(setWebglViewport) {
        if (setWebglViewport && !this.setWebglViewport) {
          this.setAttribute('set-webgl-viewport', '');
        } else if (!setWebglViewport && this.setWebglViewport) {
          this.removeAttribute('set-webgl-viewport');
        }

        this.requestRedraw();
      }

    }

    const updateAutoResize = element => {
      if (element.autoResize) {
        addAutoResizeListener(element);
      } else {
        removeAutoResizeListener(element);
      }
    };

    const addAutoResizeListener = element => {
      if (element.__autoResizeListener__ != null) {
        return;
      }

      element.__autoResizeListener__ = () => requestRedraw(element);

      addEventListener('resize', element.__autoResizeListener__);
    };

    const removeAutoResizeListener = element => {
      if (element.__autoResizeListener__ == null) {
        return;
      }

      removeEventListener('resize', element.__autoResizeListener__);
      element.__autoResizeListener__ = null;
    };

    class Group extends HTMLElement {
      connectedCallback() {
        updateAutoResize(this);
      }

      disconnectedCallback() {
        removeAutoResizeListener(this);
      }

      requestRedraw() {
        requestRedraw(this);
      }

      get autoResize() {
        return this.hasAttribute('auto-resize') && this.getAttribute('auto-resize') !== 'false';
      }

      set autoResize(autoResize) {
        if (autoResize && !this.autoResize) {
          this.setAttribute('auto-resize', '');
        } else if (!autoResize && this.autoResize) {
          this.removeAttribute('auto-resize');
        }

        updateAutoResize(this);
      }

      static get observedAttributes() {
        return ['auto-resize'];
      }

      attributeChangedCallback(name) {
        switch (name) {
          case 'auto-resize':
            updateAutoResize(this);
            break;
        }
      }

    }

    var Svg = element(() => document.createElementNS('http://www.w3.org/2000/svg', 'svg'), (element, node, {
      width,
      height
    }) => {
      node.setAttribute('viewBox', `0 0 ${width} ${height}`);
    });

    // Adapted from https://github.com/substack/insert-css
    const css = `d3fc-canvas,d3fc-svg{position:relative;display:block}\
d3fc-canvas>canvas,d3fc-svg>svg{position:absolute;height:100%;width:100%}\
d3fc-svg>svg{overflow:visible}`;
    const styleElement = document.createElement('style');
    styleElement.setAttribute('type', 'text/css');
    document.querySelector('head').appendChild(styleElement);

    if (styleElement.styleSheet) {
      styleElement.styleSheet.cssText += css;
    } else {
      styleElement.textContent += css;
    }

    /* globals customElements */

    if (typeof customElements !== 'object' || typeof customElements.define !== 'function') {
      throw new Error('d3fc-element depends on Custom Elements (v1). Make sure that you load a polyfill in older browsers. See README.');
    }

    customElements.define('d3fc-canvas', Canvas);
    customElements.define('d3fc-group', Group);
    customElements.define('d3fc-svg', Svg);

    var pointer = (() => {
      const event = d3Dispatch.dispatch('point');

      function mousemove() {
        const point = d3Selection.mouse(this);
        event.call('point', this, [{
          x: point[0],
          y: point[1]
        }]);
      }

      function mouseleave() {
        void event.call('point', this, []);
      }

      const instance = selection => {
        selection.on('mouseenter.pointer', mousemove).on('mousemove.pointer', mousemove).on('mouseleave.pointer', mouseleave);
      };

      rebind(instance, event, 'on');
      return instance;
    });

    var group = (() => {
      let key = '';
      let orient = 'vertical'; // D3 CSV returns all values as strings, this converts them to numbers
      // by default.

      let value = (row, column) => Number(row[column]);

      const verticalgroup = data => Object.keys(data[0]).filter(k => k !== key).map(k => {
        const values = data.filter(row => row[k]).map(row => {
          const cell = [row[key], value(row, k)];
          cell.data = row;
          return cell;
        });
        values.key = k;
        return values;
      });

      const horizontalgroup = data => data.map(row => {
        const values = Object.keys(row).filter(d => d !== key).map(k => {
          const cell = [k, value(row, k)];
          cell.data = row;
          return cell;
        });
        values.key = row[key];
        return values;
      });

      const group = data => orient === 'vertical' ? verticalgroup(data) : horizontalgroup(data);

      group.key = (...args) => {
        if (!args.length) {
          return key;
        }

        key = args[0];
        return group;
      };

      group.value = (...args) => {
        if (!args.length) {
          return value;
        }

        value = args[0];
        return group;
      };

      group.orient = (...args) => {
        if (!args.length) {
          return orient;
        }

        orient = args[0];
        return group;
      };

      return group;
    });

    var store = ((...names) => {
      const data = {};

      const store = target => {
        for (const key of Object.keys(data)) {
          target[key].apply(null, data[key]);
        }

        return target;
      };

      for (const name of names) {
        store[name] = (...args) => {
          if (!args.length) {
            return data[name];
          }

          data[name] = args;
          return store;
        };
      }

      return store;
    });

    // Adapted from https://github.com/substack/insert-css
    const css$1 = `d3fc-group.cartesian-chart{width:100%;height:100%;overflow:hidden;display:grid;display:-ms-grid;grid-template-columns:minmax(1em,max-content) auto 1fr auto minmax(1em,max-content);-ms-grid-columns:minmax(1em,max-content) auto 1fr auto minmax(1em,max-content);grid-template-rows:minmax(1em,max-content) auto 1fr auto minmax(1em,max-content);-ms-grid-rows:minmax(1em,max-content) auto 1fr auto minmax(1em,max-content);}
d3fc-group.cartesian-chart>.top-label{align-self:center;-ms-grid-column-align:center;justify-self:center;-ms-grid-row-align:center;grid-column:3;-ms-grid-column:3;grid-row:1;-ms-grid-row:1;}
d3fc-group.cartesian-chart>.top-axis{height:2em;grid-column:3;-ms-grid-column:3;grid-row:2;-ms-grid-row:2;}
d3fc-group.cartesian-chart>.left-label{align-self:center;-ms-grid-column-align:center;justify-self:center;-ms-grid-row-align:center;grid-column:1;-ms-grid-column:1;grid-row:3;-ms-grid-row:3;}
d3fc-group.cartesian-chart>.left-axis{width:3em;grid-column:2;-ms-grid-column:2;grid-row:3;-ms-grid-row:3;}
d3fc-group.cartesian-chart>.plot-area{overflow:hidden;grid-column:3;-ms-grid-column:3;grid-row:3;-ms-grid-row:3;}
d3fc-group.cartesian-chart>.right-axis{width:3em;grid-column:4;-ms-grid-column:4;grid-row:3;-ms-grid-row:3;}
d3fc-group.cartesian-chart>.right-label{align-self:center;-ms-grid-column-align:center;justify-self:center;-ms-grid-row-align:center;grid-column:5;-ms-grid-column:5;grid-row:3;-ms-grid-row:3;}
d3fc-group.cartesian-chart>.bottom-axis{height:2em;grid-column:3;-ms-grid-column:3;grid-row:4;-ms-grid-row:4;}
d3fc-group.cartesian-chart>.bottom-label{align-self:center;-ms-grid-column-align:center;justify-self:center;-ms-grid-row-align:center;grid-column:3;-ms-grid-column:3;grid-row:5;-ms-grid-row:5;}
d3fc-group.cartesian-chart>.y-label{display:flex;transform:rotate(-90deg);width:1em;white-space:nowrap;justify-content:center;}`;
    const styleElement$1 = document.createElement('style');
    styleElement$1.setAttribute('type', 'text/css');
    document.querySelector('head').appendChild(styleElement$1);

    if (styleElement$1.styleSheet) {
      styleElement$1.styleSheet.cssText += css$1;
    } else {
      styleElement$1.textContent += css$1;
    }

    const functor$5 = v => typeof v === 'function' ? v : () => v;

    var cartesianChart = ((...args) => {
      const {
        xScale,
        yScale,
        xAxis,
        yAxis
      } = getArguments(...args);
      let chartLabel = functor$5('');
      let xLabel = functor$5('');
      let yLabel = functor$5('');
      let xAxisHeight = functor$5(null);
      let yAxisWidth = functor$5(null);
      let yOrient = functor$5('right');
      let xOrient = functor$5('bottom');
      let webglPlotArea = null;
      let canvasPlotArea = null;
      let svgPlotArea = null;
      let isContextLost = false;
      let xAxisStore = store('tickFormat', 'ticks', 'tickArguments', 'tickSize', 'tickSizeInner', 'tickSizeOuter', 'tickValues', 'tickPadding', 'tickCenterLabel');

      let xDecorate = () => {};

      let yAxisStore = store('tickFormat', 'ticks', 'tickArguments', 'tickSize', 'tickSizeInner', 'tickSizeOuter', 'tickValues', 'tickPadding', 'tickCenterLabel');

      let yDecorate = () => {};

      let decorate = () => {};

      const containerDataJoin = dataJoin('d3fc-group', 'cartesian-chart');
      const webglDataJoin = dataJoin('d3fc-canvas', 'webgl-plot-area');
      const canvasDataJoin = dataJoin('d3fc-canvas', 'canvas-plot-area');
      const svgDataJoin = dataJoin('d3fc-svg', 'svg-plot-area');
      const xAxisDataJoin = dataJoin('d3fc-svg', 'x-axis').key(d => d);
      const yAxisDataJoin = dataJoin('d3fc-svg', 'y-axis').key(d => d);
      const chartLabelDataJoin = dataJoin('div', 'chart-label');
      const xLabelDataJoin = dataJoin('div', 'x-label').key(d => d);
      const yLabelDataJoin = dataJoin('div', 'y-label').key(d => d);

      const propagateTransition = maybeTransition => selection => maybeTransition.selection ? selection.transition(maybeTransition) : selection;

      const cartesian = selection => {
        const transitionPropagator = propagateTransition(selection);
        selection.each((data, index, group) => {
          const container = containerDataJoin(d3Selection.select(group[index]), [data]);
          container.enter().attr('auto-resize', '');
          chartLabelDataJoin(container, [xOrient(data)]).attr('class', d => d === 'top' ? 'chart-label bottom-label' : 'chart-label top-label').style('margin-bottom', d => d === 'top' ? 0 : '1em').style('margin-top', d => d === 'top' ? '1em' : 0).text(chartLabel(data));
          xLabelDataJoin(container, [xOrient(data)]).attr('class', d => `x-label ${d}-label`).text(xLabel(data));
          yLabelDataJoin(container, [yOrient(data)]).attr('class', d => `y-label ${d}-label`).text(yLabel(data));
          webglDataJoin(container, webglPlotArea ? [data] : []).attr('set-webgl-viewport', '').classed('plot-area', true).on('draw', (d, i, nodes) => {
            const canvas = d3Selection.select(nodes[i]).select('canvas').node();
            webglPlotArea.context(isContextLost ? null : canvas.getContext('webgl')).xScale(xScale).yScale(yScale);
            webglPlotArea(d);
          });
          container.select('.webgl-plot-area>canvas').on('webglcontextlost', () => {
            console.warn('WebGLRenderingContext lost');
            d3Selection.event.preventDefault();
            isContextLost = true;
            container.node().requestRedraw();
          }).on('webglcontextrestored', () => {
            console.info('WebGLRenderingContext restored');
            isContextLost = false;
            container.node().requestRedraw();
          });
          canvasDataJoin(container, canvasPlotArea ? [data] : []).classed('plot-area', true).on('draw', (d, i, nodes) => {
            const canvas = d3Selection.select(nodes[i]).select('canvas').node();
            canvasPlotArea.context(canvas.getContext('2d')).xScale(xScale).yScale(yScale);
            canvasPlotArea(d);
          });
          svgDataJoin(container, svgPlotArea ? [data] : []).classed('plot-area', true).on('draw', (d, i, nodes) => {
            svgPlotArea.xScale(xScale).yScale(yScale);
            transitionPropagator(d3Selection.select(nodes[i])).select('svg').call(svgPlotArea);
          });
          xAxisDataJoin(container, [xOrient(data)]).attr('class', d => `x-axis ${d}-axis`).style('height', xAxisHeight(data)).on('measure', (d, i, nodes) => {
            const {
              width,
              height
            } = d3Selection.event.detail;

            if (d === 'top') {
              d3Selection.select(nodes[i]).select('svg').attr('viewBox', `0 ${-height} ${width} ${height}`);
            }

            xScale.range([0, width]);
          }).on('draw', (d, i, nodes) => {
            const xAxisComponent = d === 'top' ? xAxis.top(xScale) : xAxis.bottom(xScale);
            xAxisComponent.decorate(xDecorate);
            transitionPropagator(d3Selection.select(nodes[i])).select('svg').call(xAxisStore(xAxisComponent));
          });
          yAxisDataJoin(container, [yOrient(data)]).attr('class', d => `y-axis ${d}-axis`).style('width', yAxisWidth(data)).on('measure', (d, i, nodes) => {
            const {
              width,
              height
            } = d3Selection.event.detail;

            if (d === 'left') {
              d3Selection.select(nodes[i]).select('svg').attr('viewBox', `${-width} 0 ${width} ${height}`);
            }

            yScale.range([height, 0]);
          }).on('draw', (d, i, nodes) => {
            const yAxisComponent = d === 'left' ? yAxis.left(yScale) : yAxis.right(yScale);
            yAxisComponent.decorate(yDecorate);
            transitionPropagator(d3Selection.select(nodes[i])).select('svg').call(yAxisStore(yAxisComponent));
          });
          container.each((d, i, nodes) => nodes[i].requestRedraw());
          decorate(container, data, index);
        });
      };

      const scaleExclusions = exclude(/range\w*/, // the scale range is set via the component layout
      /tickFormat/ // use axis.tickFormat instead (only present on linear scales)
      );
      rebindAll(cartesian, xScale, scaleExclusions, prefix('x'));
      rebindAll(cartesian, yScale, scaleExclusions, prefix('y'));
      rebindAll(cartesian, xAxisStore, prefix('x'));
      rebindAll(cartesian, yAxisStore, prefix('y'));

      cartesian.xOrient = (...args) => {
        if (!args.length) {
          return xOrient;
        }

        xOrient = functor$5(args[0]);
        return cartesian;
      };

      cartesian.yOrient = (...args) => {
        if (!args.length) {
          return yOrient;
        }

        yOrient = functor$5(args[0]);
        return cartesian;
      };

      cartesian.xDecorate = (...args) => {
        if (!args.length) {
          return xDecorate;
        }

        xDecorate = args[0];
        return cartesian;
      };

      cartesian.yDecorate = (...args) => {
        if (!args.length) {
          return yDecorate;
        }

        yDecorate = args[0];
        return cartesian;
      };

      cartesian.chartLabel = (...args) => {
        if (!args.length) {
          return chartLabel;
        }

        chartLabel = functor$5(args[0]);
        return cartesian;
      };

      cartesian.xLabel = (...args) => {
        if (!args.length) {
          return xLabel;
        }

        xLabel = functor$5(args[0]);
        return cartesian;
      };

      cartesian.yLabel = (...args) => {
        if (!args.length) {
          return yLabel;
        }

        yLabel = functor$5(args[0]);
        return cartesian;
      };

      cartesian.xAxisHeight = (...args) => {
        if (!args.length) {
          return xAxisHeight;
        }

        xAxisHeight = functor$5(args[0]);
        return cartesian;
      };

      cartesian.yAxisWidth = (...args) => {
        if (!args.length) {
          return yAxisWidth;
        }

        yAxisWidth = functor$5(args[0]);
        return cartesian;
      };

      cartesian.webglPlotArea = (...args) => {
        if (!args.length) {
          return webglPlotArea;
        }

        webglPlotArea = args[0];
        return cartesian;
      };

      cartesian.canvasPlotArea = (...args) => {
        if (!args.length) {
          return canvasPlotArea;
        }

        canvasPlotArea = args[0];
        return cartesian;
      };

      cartesian.svgPlotArea = (...args) => {
        if (!args.length) {
          return svgPlotArea;
        }

        svgPlotArea = args[0];
        return cartesian;
      };

      cartesian.decorate = (...args) => {
        if (!args.length) {
          return decorate;
        }

        decorate = args[0];
        return cartesian;
      };

      return cartesian;
    });

    const getArguments = (...args) => {
      const defaultSettings = {
        xScale: d3Scale.scaleIdentity(),
        yScale: d3Scale.scaleIdentity(),
        xAxis: {
          bottom: axisBottom,
          top: axisTop
        },
        yAxis: {
          right: axisRight,
          left: axisLeft
        }
      };

      if (args.length === 1 && !args[0].domain && !args[0].range) {
        // Settings object
        return Object.assign(defaultSettings, args[0]);
      } // xScale/yScale parameters


      return Object.assign(defaultSettings, {
        xScale: args[0] || defaultSettings.xScale,
        yScale: args[1] || defaultSettings.yScale
      });
    };

    const functor$6 = v => typeof v === 'function' ? v : () => v;

    var cartesianBase = ((setPlotArea, defaultPlotArea) => (...args) => {
      let yLabel = functor$6('');
      let plotArea = defaultPlotArea;

      let decorate = () => {};

      const cartesian = cartesianChart(...args);

      const cartesianBase = selection => {
        setPlotArea(cartesian, plotArea);
        cartesian.decorate((container, data, index) => {
          container.enter().select('.x-label').style('height', '1em').style('line-height', '1em');
          const yOrientValue = cartesian.yOrient()(data);
          container.enter().append('div').attr('class', 'y-label-container').style('grid-column', yOrientValue === 'left' ? 1 : 5).style('-ms-grid-column', yOrientValue === 'left' ? 1 : 5).style('grid-row', 3).style('-ms-grid-row', 3).style('width', '1em').style('display', 'flex').style('align-items', 'center').style('justify-content', 'center').style('white-space', 'nowrap').append('div').attr('class', 'y-label').style('transform', 'rotate(-90deg)');
          container.select('.y-label-container>.y-label').text(yLabel);
          decorate(container, data, index);
        });
        selection.call(cartesian);
      };

      rebindAll(cartesianBase, cartesian, include(/^x/, /^y/, 'chartLabel'));

      cartesianBase.yLabel = (...args) => {
        if (!args.length) {
          return yLabel;
        }

        yLabel = functor$6(args[0]);
        return cartesianBase;
      };

      cartesianBase.plotArea = (...args) => {
        if (!args.length) {
          return plotArea;
        }

        plotArea = args[0];
        return cartesianBase;
      };

      cartesianBase.decorate = (...args) => {
        if (!args.length) {
          return decorate;
        }

        decorate = args[0];
        return cartesianBase;
      };

      return cartesianBase;
    });

    var cartesian = cartesianBase((cartesian, plotArea) => cartesian.svgPlotArea(plotArea), seriesSvgLine);

    var cartesian$1 = cartesianBase((cartesian, plotArea) => cartesian.canvasPlotArea(plotArea), seriesCanvasLine);

    const brushForOrient = orient => {
      switch (orient) {
        case 'x':
          return d3Brush.brushX();

        case 'y':
          return d3Brush.brushY();

        case 'xy':
          return d3Brush.brush();
      }
    };

    const invertRange = range => [range[1], range[0]];

    const brushBase = orient => {
      const brush = brushForOrient(orient);
      const eventDispatch = d3Dispatch.dispatch('brush', 'start', 'end');
      let xScale = d3Scale.scaleIdentity();
      let yScale = d3Scale.scaleIdentity();
      const innerJoin = dataJoin('g', 'brush');

      const mapSelection = (selection, xMapping, yMapping) => {
        switch (orient) {
          case 'x':
            return selection.map(xMapping);

          case 'y':
            return selection.map(yMapping);

          case 'xy':
            return [[xMapping(selection[0][0]), yMapping(selection[0][1])], [xMapping(selection[1][0]), yMapping(selection[1][1])]];
        }
      };

      const percentToSelection = percent => mapSelection(percent, d3Scale.scaleLinear().domain(xScale.range()).invert, d3Scale.scaleLinear().domain(invertRange(yScale.range())).invert);

      const selectionToPercent = selection => mapSelection(selection, d3Scale.scaleLinear().domain(xScale.range()), d3Scale.scaleLinear().domain(invertRange(yScale.range())));

      const updateXDomain = selection => {
        const f = d3Scale.scaleLinear().domain(xScale.domain());

        if (orient === 'x') {
          return selection.map(f.invert);
        } else if (orient === 'xy') {
          return [f.invert(selection[0][0]), f.invert(selection[1][0])];
        }
      };

      const updateYDomain = selection => {
        const g = d3Scale.scaleLinear().domain(invertRange(yScale.domain()));

        if (orient === 'y') {
          return [selection[1], selection[0]].map(g.invert);
        } else if (orient === 'xy') {
          return [g.invert(selection[1][1]), g.invert(selection[0][1])];
        }
      };

      const transformEvent = event => {
        // The render function calls brush.move, which triggers, start, brush and end events. We don't
        // really want those events so suppress them.
        if (event.sourceEvent && event.sourceEvent.type === 'draw') return;

        if (event.selection) {
          const mappedSelection = selectionToPercent(event.selection);
          eventDispatch.call(event.type, {}, {
            selection: mappedSelection,
            xDomain: updateXDomain(mappedSelection),
            yDomain: updateYDomain(mappedSelection)
          });
        } else {
          eventDispatch.call(event.type, {}, {});
        }
      };

      const base = selection => {
        selection.each((data, index, group) => {
          // set the extent
          brush.extent([[xScale.range()[0], yScale.range()[1]], [xScale.range()[1], yScale.range()[0]]]); // forwards events

          brush.on('end', () => transformEvent(d3Selection.event)).on('brush', () => transformEvent(d3Selection.event)).on('start', () => transformEvent(d3Selection.event)); // render

          const container = innerJoin(d3Selection.select(group[index]), [data]);
          container.call(brush).call(brush.move, data ? percentToSelection(data) : null);
        });
      };

      base.xScale = (...args) => {
        if (!args.length) {
          return xScale;
        }

        xScale = args[0];
        return base;
      };

      base.yScale = (...args) => {
        if (!args.length) {
          return yScale;
        }

        yScale = args[0];
        return base;
      };

      rebind(base, eventDispatch, 'on');
      rebind(base, brush, 'filter', 'handleSize');
      return base;
    };

    const brushX = () => brushBase('x');
    const brushY = () => brushBase('y');
    const brush = () => brushBase('xy');

    exports.annotationCanvasBand = band$1;
    exports.annotationCanvasCrosshair = crosshair$1;
    exports.annotationCanvasGridline = gridline$1;
    exports.annotationCanvasLine = annotationLine$1;
    exports.annotationSvgBand = band;
    exports.annotationSvgCrosshair = crosshair;
    exports.annotationSvgGridline = gridline;
    exports.annotationSvgLine = annotationLine;
    exports.autoBandwidth = autoBandwidth;
    exports.axisBottom = axisBottom;
    exports.axisLabelOffset = axisLabelOffset;
    exports.axisLabelRotate = axisLabelRotate;
    exports.axisLeft = axisLeft;
    exports.axisOrdinalBottom = axisOrdinalBottom;
    exports.axisOrdinalLeft = axisOrdinalLeft;
    exports.axisOrdinalRight = axisOrdinalRight;
    exports.axisOrdinalTop = axisOrdinalTop;
    exports.axisRight = axisRight;
    exports.axisTop = axisTop;
    exports.brush = brush;
    exports.brushX = brushX;
    exports.brushY = brushY;
    exports.bucket = bucket;
    exports.chartCanvasCartesian = cartesian$1;
    exports.chartCartesian = cartesianChart;
    exports.chartSvgCartesian = cartesian;
    exports.dataJoin = dataJoin;
    exports.discontinuityIdentity = identity$1;
    exports.discontinuityRange = provider;
    exports.discontinuitySkipUtcWeekends = skipUtcWeekends;
    exports.discontinuitySkipWeekends = skipWeekends;
    exports.effectivelyZero = effectivelyZero;
    exports.exclude = exclude;
    exports.extentDate = time;
    exports.extentLinear = linearExtent;
    exports.extentTime = time;
    exports.feedGdax = gdax;
    exports.group = group;
    exports.include = include;
    exports.includeMap = includeMap;
    exports.indicatorBollingerBands = bollingerBands;
    exports.indicatorElderRay = elderRay;
    exports.indicatorEnvelope = envelope;
    exports.indicatorExponentialMovingAverage = exponentialMovingAverage;
    exports.indicatorForceIndex = forceIndex;
    exports.indicatorMacd = macd;
    exports.indicatorMovingAverage = movingAverage;
    exports.indicatorRelativeStrengthIndex = relativeStrengthIndex;
    exports.indicatorStochasticOscillator = stochasticOscillator;
    exports.largestTriangleOneBucket = largestTriangleOneBucket;
    exports.largestTriangleThreeBucket = largestTriangleThreeBucket;
    exports.layoutAnnealing = annealing;
    exports.layoutBoundingBox = boundingBox;
    exports.layoutGreedy = greedy;
    exports.layoutLabel = label;
    exports.layoutRemoveOverlaps = removeOverlaps;
    exports.layoutTextLabel = textLabel;
    exports.modeMedian = modeMedian;
    exports.pointer = pointer;
    exports.prefix = prefix;
    exports.randomFinancial = financial;
    exports.randomGeometricBrownianMotion = geometricBrownianMotion;
    exports.randomSkipWeekends = skipWeekends$1;
    exports.rebind = rebind;
    exports.rebindAll = rebindAll;
    exports.scaleDiscontinuous = discontinuous;
    exports.seriesCanvasArea = area$3;
    exports.seriesCanvasBar = bar$3;
    exports.seriesCanvasBoxPlot = boxPlot$3;
    exports.seriesCanvasCandlestick = candlestick$3;
    exports.seriesCanvasErrorBar = errorBar$3;
    exports.seriesCanvasGrouped = grouped$1;
    exports.seriesCanvasHeatmap = heatmap$1;
    exports.seriesCanvasLine = seriesCanvasLine;
    exports.seriesCanvasMulti = seriesCanvasMulti;
    exports.seriesCanvasOhlc = ohlc$3;
    exports.seriesCanvasPoint = seriesCanvasPoint;
    exports.seriesCanvasRepeat = repeat$1;
    exports.seriesSvgArea = area$2;
    exports.seriesSvgBar = bar$2;
    exports.seriesSvgBoxPlot = boxPlot$2;
    exports.seriesSvgCandlestick = candlestick$2;
    exports.seriesSvgErrorBar = errorBar$2;
    exports.seriesSvgGrouped = grouped;
    exports.seriesSvgHeatmap = heatmap;
    exports.seriesSvgLine = seriesSvgLine;
    exports.seriesSvgMulti = seriesSvgMulti;
    exports.seriesSvgOhlc = ohlc$2;
    exports.seriesSvgPoint = seriesSvgPoint;
    exports.seriesSvgRepeat = repeat;
    exports.seriesWebglArea = area$4;
    exports.seriesWebglBar = bar$4;
    exports.seriesWebglBoxPlot = boxPlot$4;
    exports.seriesWebglCandlestick = candlestick$4;
    exports.seriesWebglErrorBar = errorBar$4;
    exports.seriesWebglLine = line$1;
    exports.seriesWebglMulti = seriesCanvasMulti;
    exports.seriesWebglOhlc = ohlc$4;
    exports.seriesWebglPoint = point;
    exports.seriesWebglRepeat = repeat$1;
    exports.shapeBar = shapeBar;
    exports.shapeBoxPlot = shapeBoxPlot;
    exports.shapeCandlestick = shapeCandlestick;
    exports.shapeErrorBar = shapeErrorBar;
    exports.shapeOhlc = shapeOhlc;
    exports.webglAdjacentElementAttribute = webglAdjacentElementAttribute;
    exports.webglBaseAttribute = baseAttributeBuilder;
    exports.webglBufferBuilder = bufferBuilder;
    exports.webglElementAttribute = webglElementAttribute;
    exports.webglElementIndices = elementIndices;
    exports.webglFillColor = fillColor$2;
    exports.webglProgramBuilder = programBuilder;
    exports.webglScaleLinear = linear;
    exports.webglScaleLog = log;
    exports.webglScaleMapper = webglScaleMapper;
    exports.webglScalePow = pow;
    exports.webglSeriesArea = webglSeriesArea;
    exports.webglSeriesBar = webglSeriesBar;
    exports.webglSeriesBoxPlot = webglSeriesBoxPlot;
    exports.webglSeriesCandlestick = webglSeriesCandlestick;
    exports.webglSeriesErrorBar = webglSeriesErrorBar;
    exports.webglSeriesLine = webglSeriesLine;
    exports.webglSeriesOhlc = webglSeriesOhlc;
    exports.webglSeriesPoint = webglSeriesPoint;
    exports.webglShaderBuilder = shaderBuilder;
    exports.webglStrokeColor = strokeColor$2;
    exports.webglSymbolMapper = webglSymbolMapper;
    exports.webglTypes = types;
    exports.webglUniform = uniform;
    exports.webglVertexAttribute = vertexAttribute;

    Object.defineProperty(exports, '__esModule', { value: true });

}));
