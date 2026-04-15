;(function($) {
  // register namespace
  $.extend(true, window, {
    cadc: {
      web: {
        science: {
          portal: {
            session: {
              PortalSession: PortalSession,
              // Events
              events: {
                onLoadSessionListDone: new jQuery.Event("sciPort:onLoadSessionListDone"),
                onLoadSessionListError: new jQuery.Event("sciPort:onLoadSessionListError"),
                onSessionActionDone: new jQuery.Event("sciPort:onSessionActionDone"),
                onSessionActionError: new jQuery.Event("sciPort:onSessionActionError"),
                onLoadPlatformUsageDone: new jQuery.Event("sciPort:onLoadPlatformUsageDone"),
                onLoadPlatformUsageError: new jQuery.Event("sciPort:onLoadPlatformUsageError"),
                onPollingContinue: new jQuery.Event("sciPort:onPollingContinue"),
              }
            },
            parseRegex: new RegExp(/([0-9]+(?:\.[0-9]+)?)\s*([kmgtp]?)/ig)
          }
        }
      }
    }
  })


  /**
   * Class for handling Skaha session interaction and data
   * @constructor
   */
  function PortalSession() {
    var _selfPortalSess = this
    var _isEmpty = true
    this._sessionList = []
    this._sessionTypeList = []
    this._platformUsage = {}

    this._backgroundColorPalette = [
      "#0E4D92",
      "#4682B4",
      "#57A0D3",
    ]

    this._hoverBackgroundColorPalette = [
      "#0080FF",
      "#0F52BA",
      "#008ECC"
    ]

    function setServiceURLs(URLObject) {
      _selfPortalSess.sessionServiceURL = URLObject.session
    }

    function initSessionLists() {
      _isEmpty = true
      _selfPortalSess._sessionList = {}
      _selfPortalSess._filteredSessionList = {}
    }


    function getPlatformUsage() {
      return _selfPortalSess._platformUsage
    }

    function getSessionList() {
      if (_selfPortalSess._sessionList === []) {
        initSessionLists()
      }
      return _selfPortalSess._sessionList
    }

    function setSessionTypeList(thelist) {
      _selfPortalSess._sessionTypeList = thelist
    }

    var statusDisplayPriority = {
      "running" : 1,
      "pending" : 2,
      "terminating" : 3,
      "succeeded" : 4,
      "failed" : 5,
      "unknown": 6
    }

    var typeDisplayPriority = {
      "notebook" : 1,
      "desktop" : 2,
      "carta" : 3,
      "contributed" : 4,
      "firefly" : 5,
      "headless" : 6
    }

    function sortSessions(sList) {
      sList.forEach((e) => {
        console.log(`${e.type} ${e.status} ${e.name}`);
      });


      sList.sort((a, b) => {
        // Sort order: type, status, name

        // rough sort by type first
        let typeA = a.type.toLowerCase()
        let typeOrderA = typeDisplayPriority[typeA]
        let typeB = b.type.toLowerCase()
        let typeOrderB = typeDisplayPriority[typeB]

        if (typeOrderA < typeOrderB) {
          return -1
        }
        if (typeOrderA > typeOrderB) {
          return 1
        }

        if (typeOrderA === typeOrderB) {

          let statusA = a.status.toLowerCase()
          let orderA = statusDisplayPriority[statusA]
          let statusB = b.status.toLowerCase()
          let orderB = statusDisplayPriority[statusB]

          if (orderA < orderB) {
            return -1
          }

          if (orderA > orderB) {
            return 1
          }

          if (orderA === orderB) {

            let nameA = a.name.toLowerCase()
            let nameB = b.name.toLowerCase()


            if (nameA < nameB) {
              return -1
            }

            if (nameA > nameB) {
              return 1
            }

            return 0
          }
        }

      })

      sList.forEach((e) => {
        console.log(`${e.type} ${e.status} ${e.name}`);
      });

      return sList
    }


    function getSessionByID(sessionID) {
      var session = null
      for (var i = 0; i < _selfPortalSess._sessionList.length; i++) {
        if (_selfPortalSess._sessionList[i].id == sessionID) {
          session = _selfPortalSess._sessionList[i]
        }
      }
      return session
    }

    function getSessionByNameType(sessionData) {
      var session = null
      for (var i = 0; i < _selfPortalSess._sessionList.length; i++) {
        if ((_selfPortalSess._sessionList[i].name == sessionData.name) &&
        (_selfPortalSess._sessionList[i].type == sessionData.type) ) {
          session = _selfPortalSess._sessionList[i]
        }
      }
      return session
    }



    /**
     * Check if session for sessionID is of the given status
     * @param sessionID
     * @param sessionStatus
     * @returns {boolean}
     */
    function isSessionStatusByID(sessionID, sessionStatus) {
      var isStatus = false
      if (sessionID != {}) {
        var session = _selfPortalSess.getSessionByID(sessionID)
        if (session != null) {
          if (session.status == sessionStatus){
            isStatus = true
          }
        }
      }
      return isStatus
    }


    function isRunningSession(session) {
      return isSessionStatus(session, "Running")
    }


    function getFilteredSessionList() {
      _selfPortalSess._filteredSessionList = new Array()

      var tmpList = new Array()

      for (var i=0; i<_selfPortalSess._sessionList.length; i++) {
        var curSes = _selfPortalSess._sessionList[i]

        const isInList = (element) => element === curSes.type
        var typeIndex = _selfPortalSess._sessionTypeList.findIndex(isInList)

        if (typeIndex !== -1) {
          if ( curSes.status === "Running" || curSes.status === "Pending") {
            tmpList.push(curSes)
          }
        }
      }
      _selfPortalSess._filteredSessionList = tmpList

      return tmpList
    }


    function isAllSessionsStable() {
      var allStable = true

      for (var i = 0; i < _selfPortalSess._sessionList.length; i++) {
        // Only Pending state will trigger a poll
        if (_selfPortalSess._sessionList[i].status === "Pending") {
          allStable = false
          break
        }
      }
      return allStable
    }


    function isSessionStatus(session, sessionStatus) {
      return session.status === sessionStatus
    }

    /**
     * Build a default session name based on the session type and current count
     * of sessions
     * @param sessionType
     * @returns {*}
     */
    function getDefaultSessionName(sessionType) {
      // First entry will have a "1"
      var count = 1
      for (var i = 0; i < _selfPortalSess._sessionList.length; i++) {
        if (_selfPortalSess._sessionList[i].type === sessionType) {
          count++
        }
      }
      return sessionType + count
    }

    function setSessionList(sessionList) {
      if (sessionList.length > 0) {
        _selfPortalSess._sessionList = sessionList
        _selfPortalSess._isEmpty = false
      } else {
        _selfPortalSess._sessionList = []
        _selfPortalSess._isEmpty = true
      }
    }


    function isSessionListEmpty() {
      return _selfPortalSess._isEmpty
    }

    function getViewLogsURL(sessionID) {
      return _selfPortalSess.sessionServiceURL + "/" + sessionID + "?view=logs"
    }

    function getViewEventsURL(sessionID) {
      return _selfPortalSess.sessionServiceURL + "/" + sessionID + "?view=events"
    }

    /**
     * Run these on page load to get data for populating session list
     * and platform usage.
    */

    /**
     * Given a quantified file size string (e.g. 34.2G), return the numeric value in the
     * same unit (e.g. 34.2).
     * @param {string} fileSize Input quantified file size
     * @returns {float}
     */
    function parseFileSize(fileSize) {
      const matches = [...fileSize.matchAll(cadc.web.science.portal.parseRegex)]

      // Two decimal places
      return parseFloat(matches.map(m => m[1])[0]).toFixed(2)
    }

    function zeroPrefix(value) {
      return ("0" + value).slice(-2)
    }

    function loadPlatformUsage(refreshHandler) {
      var statsURL = _selfPortalSess.sessionServiceURL + "?view=stats"
      Promise.resolve(_getAjaxData(statsURL, {}))
          .then((platformUsage) => {

            var nowDate = new Date()
            var month = nowDate.getUTCMonth() + 1
            _selfPortalSess._platformUsage.updated = nowDate.getUTCFullYear() + "-"
                + zeroPrefix(month) + "-" + zeroPrefix(nowDate.getUTCDate())
                + " " + zeroPrefix(nowDate.getUTCHours()) + ":" + zeroPrefix(nowDate.getMinutes())

            // The free and totals are displayed, and so are parsed and fixed.  The used field is data fed to the progress bar.
            _selfPortalSess._platformUsage.cpu = {
              "used" : platformUsage.cores.requestedCPUCores,
              "free" : platformUsage.cores.cpuCoresAvailable - platformUsage.cores.requestedCPUCores,
              "total" : platformUsage.cores.cpuCoresAvailable,
              "display": {
                "free": (parseFloat(platformUsage.cores.cpuCoresAvailable) - parseFloat(platformUsage.cores.requestedCPUCores)).toFixed(1),
                "total": parseFloat(platformUsage.cores.cpuCoresAvailable).toFixed(1)
              }
            }

            // {requestedRAM: "0G", ramAvailable: "0G", maxRAM: {ram: "0G", withCPUCores: 0}} 
            const requestedRAMGB = parseFileSize(platformUsage.ram.requestedRAM)
            const availableRAMGB = parseFileSize(platformUsage.ram.ramAvailable)
            _selfPortalSess._platformUsage.ram = {
              "unit" : "GB",
              "used" : requestedRAMGB,
              "free" : availableRAMGB - requestedRAMGB,
              "total" : availableRAMGB,
              "display": {
                "free" : (parseFloat(availableRAMGB) - parseFloat(requestedRAMGB)).toFixed(2),
                "total" : parseFloat(availableRAMGB).toFixed(2)
              }
            }

            /*
            The platformUsages.instances object is checked here for backward compatibility.  It has been effectively
            disabled on the server side, but if it is re-enabled in the future, this code will handle it.
            jenkinsd
            2025.11.19
             */
            // These values may change over time, so store the key name
            // in order to use it as a label
            _selfPortalSess._platformUsage.instances = {
              labels: new Array(),
              data: new Array(),
              backgroundColor: new Array(),
              hoverBackgroundColor: new Array(),
              total: platformUsage.instances?.total
            }

            let entries = Object.entries(platformUsage.instances || {})
            let i = 0;
            let biggestCount = 0;
              let entry;
              entries.forEach( ([key, val] = entry) => {
              if (key !== "total") {
                _selfPortalSess._platformUsage.instances.labels.push(key)
                _selfPortalSess._platformUsage.instances.data.push(val)
                _selfPortalSess._platformUsage.instances.backgroundColor.push(_selfPortalSess._backgroundColorPalette[i])
                _selfPortalSess._platformUsage.instances.hoverBackgroundColor.push(_selfPortalSess._hoverBackgroundColorPalette[i])
                i++
                biggestCount = Math.max(val, biggestCount)
              }
            });

            // This will be used for the max height of the bar chart being displayed
            // Code is here rather than in the SciencePortalPlatformUsage component
            // because it's better to do this work once than (potentially)
            // every time the component is rendered
            _selfPortalSess._platformUsage.instances.biggestCount = Math.ceil(biggestCount / 10) * 10
            _selfPortalSess._platformUsage.refreshHandler = refreshHandler
            _selfPortalSess._platformUsage.listType = "data"

            trigger(_selfPortalSess, cadc.web.science.portal.session.events.onLoadPlatformUsageDone)
          })
          .catch(function(message) {
            // get session list failed in a way that can't allow page to continue
            trigger(_selfPortalSess, cadc.web.science.portal.session.events.onLoadPlatformUsageError, message)
          })
    }

    function loadSessionList() {
      Promise.resolve(_getAjaxData(`${_selfPortalSess.sessionServiceURL}?view=interactive`, {}))
        .then(function(sessionList) {
          setSessionList(sessionList)
          trigger(_selfPortalSess, cadc.web.science.portal.session.events.onLoadSessionListDone)

        })
        .catch(function(message) {
          // get session list failed in a way that can't allow page to continue
          trigger(_selfPortalSess, cadc.web.science.portal.session.events.onLoadSessionListError, message)
        })
    }

    function deleteSession(sessionID) {
      Promise.resolve(deleteSessionAjax(_selfPortalSess.sessionServiceURL + "/" + sessionID, sessionID))
        .then(function(sessionID) {
          trigger(_selfPortalSess, cadc.web.science.portal.session.events.onSessionActionDone, sessionID)
        })
        .catch(function(message) {
          // get session list failed in a way that can't allow page to continue
          trigger(_selfPortalSess, cadc.web.science.portal.session.events.onSessionActionError, message)
        })
    }

    function deleteSessionAjax(serviceURL, sessionID) {
      return new Promise(function (resolve, reject) {
        var request = new XMLHttpRequest()

        // "load" is the XMLHttpRequest "finished" event
        request.addEventListener(
          "load",
          function () {
            if (request.status === 200) {
              resolve(sessionID)
            } else {
              reject(request)
            }
          },
          false
        )
        // withCredentials enables cookies to be sent
        request.withCredentials = true
        request.open("DELETE", serviceURL)
        request.send(null)
      })
    }


    function renewSession(sessionID) {
      var _formData = new FormData();
      _formData.append("action", "renew")

      Promise.resolve(renewSessionAjax(_selfPortalSess.sessionServiceURL + "/" + sessionID, sessionID, _formData))
        .then(function(sessionID) {
          trigger(_selfPortalSess, cadc.web.science.portal.session.events.onSessionActionDone, sessionID)
        })
        .catch(function(message) {
          // get session list failed in a way that can't allow page to continue
          trigger(_selfPortalSess, cadc.web.science.portal.session.events.onSessionActionError, message)
        })
    }

    function renewSessionAjax(serviceURL, sessionID, sessionAction) {
      return new Promise(function (resolve, reject) {
        var request = new XMLHttpRequest()

        // "load" is the XMLHttpRequest "finished" event
        request.addEventListener(
          "load",
          function () {
            if (request.status === 200) {
              resolve(sessionID)
            } else {
              reject(request)
            }
          },
          false
        )
        // withCredentials enables cookies to be sent
        request.withCredentials = true
        request.open("POST", serviceURL)
        request.send(sessionAction)
      })
    }

    // Used for GETs: session list, session stats
    function _getAjaxData(serviceURL) {
      return new Promise(function (resolve, reject) {
        var request = new XMLHttpRequest()

        // 'load' is the XMLHttpRequest 'finished' event
        request.addEventListener(
            "load",
            function () {
              if (request.status === 200) {
                var jsonData = JSON.parse(request.responseText)
                resolve(jsonData)
              } else {
                reject(request)
              }
            },
            false
        )
        // withCredentials enables cookies to be sent
        // Note: SameSite cookie header isn't set with this method,
        // may cause problems with Chrome and other browsers? Feb 2021
        request.withCredentials = true
        request.open("GET", serviceURL)
        request.send(null)
      })
    }

    function pollSessionList(interval) {
        // TODO: consider long-running timeout so panel left in background doesn't use
        // resources forever
        interval = interval || 200

        var checkCondition = function (resolve, reject) {
          _getAjaxData(`${_selfPortalSess.sessionServiceURL}?view=interactive`, {})
            .then(function (sessionList) {
              _selfPortalSess.setSessionList(sessionList)
              if (_selfPortalSess.isAllSessionsStable()) {
                resolve("done")
              } else {
                // If neither of the conditions are met and the timeout
                // hasn't elapsed, go again
                // update info modal with current status?
                trigger(_selfPortalSess, cadc.web.science.portal.session.events.onPollingContinue)
                setTimeout(checkCondition, interval, resolve, reject)
              }
            })
            .catch(function (message) {
              reject(new Error("Error polling session list. Reload page to try again or contact CANFAR admin for assistance."))
            })
        } // end checkCondition
        return new Promise(checkCondition)
    }

    // ---------- Event Handling Functions ----------

    function subscribe(target, event, eHandler) {
      $(target).on(event.type, eHandler)
    }

    function unsubscribe(target, event) {
      $(target).unbind(event.type)
    }

    function trigger(target, event, eventData) {
      $(target).trigger(event, eventData)
    }


    initSessionLists()

      $.extend(this, {
        setServiceURLs: setServiceURLs,
        initSessionLists: initSessionLists,
        getDefaultSessionName: getDefaultSessionName,
        getViewLogsURL: getViewLogsURL,
        getViewEventsURL: getViewEventsURL,
        getPlatformUsage: getPlatformUsage,
        getSessionByID: getSessionByID,
        getSessionByNameType: getSessionByNameType,
        getSessionList: getSessionList,
        getFilteredSessionList: getFilteredSessionList,
        loadPlatformUsage: loadPlatformUsage,
        loadSessionList: loadSessionList,
        setSessionList: setSessionList,
        setSessionTypeList: setSessionTypeList,
        isAllSessionsStable: isAllSessionsStable,
        isSessionStatus: isSessionStatus,
        isRunningSession: isRunningSession,
        isSessionStatusByID: isSessionStatusByID,
        isSessionListEmpty : isSessionListEmpty,
        pollSessionList: pollSessionList,
        deleteSession: deleteSession,
        renewSession: renewSession,
        sortSessions: sortSessions
      })
    }

})(jQuery)
