;(function($) {
  // register namespace
  $.extend(true, window, {
    cadc: {
      web: {
        science: {
          portal: {
            PortalApp: PortalApp,
            // Events
            events: {
              onSessionRequestOK: new jQuery.Event("sciPort:onSessionRequestOK"),
              onSessionRequestFail: new jQuery.Event("sciPort:onSessionRequestFail"),
            },
            authErrorHandling: {
                codes: [401, 403],
                header: "Science Platform authorization issue",
                body: "Your userid is not authorized to use Science Platform resources. Contact an admin for assistance."
            }
          }
        }
      }
    }
  })

  /**
   * Controller for Science Portal UI. Contains event management backbone for the form, session list
   * and error handling. Behaviour of page is controlled from here, including showing and hiding
   * various page elements which are included in the index.jsp file for the project.
   * Individual session list items are built dynamically within this code.
   *
   * @constructor
   * @param {{}} inputs   Input configuration.
   *
   * where
   *  inputs = {
   *       baseURL: <URL app is launched from>
   *       sessionsResourceID: "<resourceID of session web service>"
    *    }
   */
  function PortalApp(inputs) {
    const _reactApp = window.SciencePortalApp

    const _selfPortalApp = this

    this.baseURL = inputs.baseURL

    inputs.headerURLs.baseURLCanfar = inputs.baseURL

    inputs.reactApp = _reactApp

    _reactApp.setTheme(inputs.theme)
    _reactApp.setHeaderURLs(inputs.headerURLs)
    if (inputs.storageXmlInfoUrl) {
      _reactApp.setStorageUrl(inputs.storageXmlInfoUrl)
    }
    if (inputs.tabLabels) {
      _reactApp.setTabLabels(inputs.tabLabels)
    }

    var portalCore = new cadc.web.science.portal.core.PortalCore(inputs)
    var portalSessions = new cadc.web.science.portal.session.PortalSession(inputs)
    var portalForm = new cadc.web.science.portal.form.PortalForm(inputs)

    // This folder is the location of config json and other assets
    // Variable to support the dev and dist environments
    var contentBase = inputs.contentBase

    this.isDev = false
    if (typeof inputs.isDev !== "undefined") {
      this.isDev = inputs.isDev
    }

    // NOTE: this is for dev or situations where a registry app
    // might not be available
    var URLOverrides = inputs.URLOverrides

    this.isPolling = false
    var _state = {
      currentSessionData: {}
    }
    var _curSessionType

    // ------------ Page load functions ------------

    function init() {
      attachListeners()
      portalForm.setContentBase(contentBase)

      // loads from session_type_map_en.json.
      // Timing issues can occur on very fast systems, so this issues it's own
      // event when finished to control when the next stage of portal initialization occurs
      portalForm.loadSessionTypeMap()
      portalCore.setPageState("all", "primary", true, "")
    }

    function continueInit() {
      portalSessions.setSessionTypeList(portalForm.getSessionTypeList())

      // Put this up because the authentication step can be a bit tardy, otherwise
      // it looks like the portal isn't doing anything.
      // portalCore.setModal(_reactApp, "Initializing", "Validating credentials", true, false, false)
      // portalCore.initConfirmModal(_reactApp, handleConfirmedDelete, handleCancelDelete)

      if (typeof inputs.bannerText !== "undefined") {
        _reactApp.setBanner(inputs.bannerText)
      }

      // Nothing happens if user is not authenticated, so no other page
      // load information is done until this call comes back (see onAuthenticated event below)
      // onAuthenticated event triggered if everything is OK.
      portalCore.checkAuthentication()
    }

    function attachListeners() {
      // Button/page click listeners
      $(".sp-session-reload").click(checkForSessions)
      $(".sp-e-usage-reload").click(handlePlatformUsageLoad)

      // Data Flow/javascript object listeners
      // portalCore listeners
      portalCore.subscribe(portalCore, cadc.web.science.portal.core.events.onAuthenticated, (_e, data) => {
        // onServiceURLOK comes from here
        // Contacts the registry to discover where the sessions web service is,
        // builds endpoints used to manage sessions, get session, context, image lists, etc.
        portalCore.init(URLOverrides, data.accessToken)
      })

      portalCore.subscribe(portalCore, cadc.web.science.portal.core.events.onServiceURLOK, (_e, data) => {
        portalSessions.setServiceURLs(portalCore.sessionServiceURLs)
        portalForm.setServiceURLs(portalCore.sessionServiceURLs)

        portalForm.setDataFilters(portalCore.dataFilters)

        // Get portalForm to start collecting form data
        portalForm.getFormData()

        // Get platform Usage information
        portalSessions.loadPlatformUsage()

        // Start loading session lists
        checkForSessions()
      })

      portalCore.subscribe(portalCore, cadc.web.science.portal.core.events.onServiceURLFail, function (e, data){
        // Unable to contact registry to get sessions web service URL
        portalCore.setPageState(portalCore.pageSections.all,"danger", false)

        portalCore.setModal(_reactApp, "Portal Unavailable",
          "Unable to establish communication with Skaha web service. "
            + "Reload page to try again or contact CANFAR admin for assistance.",
          false, true, true)
      })


      // portalSessions listeners
      portalCore.subscribe(portalSessions, cadc.web.science.portal.session.events.onLoadSessionListDone, function (e) {
        // Build session list on top of page
        var filteredList = portalSessions.getFilteredSessionList()
        populateSessionList(filteredList)
        portalCore.setPageState(portalCore.pageSections.sessionList, "success", false)
        portalCore.hideModal()

        if (( _selfPortalApp.isPolling === false)
          && (portalSessions.isAllSessionsStable() === false) ){

          // Flag polling is occurring so only one instance is running at a time.
          // Any changes in session list will be picked up by the single polling instance
          _selfPortalApp.isPolling = true

          // If everything is stable, stop. If no, kick off polling
          portalSessions.pollSessionList(8000)
            .then(function (finalState) {
              if (finalState == "done") {
                // Grab new session list
                var filteredList = portalSessions.getFilteredSessionList()
                populateSessionList(filteredList)
              }
            })
            .catch(function (message) {
              portalCore.setModal(_reactApp, "Error getting session list",
                "Unable to get session list. " +
                "Reload the page to try again, or contact CANFAR admin for assistance.",
                false, true, true)
            })

          _selfPortalApp.isPolling = false
        }
      })

      portalCore.subscribe(portalSessions, cadc.web.science.portal.session.events.onPollingContinue, function (e) {
        // Rebuild session list on top of page
        var filteredList = portalSessions.getFilteredSessionList()
        populateSessionList(filteredList)
      })

      portalCore.subscribe(portalSessions, cadc.web.science.portal.session.events.onLoadSessionListError, handleServiceError)
      portalCore.subscribe(portalSessions, cadc.web.science.portal.session.events.onSessionActionDone, refreshSessionForm)
      portalCore.subscribe(portalSessions, cadc.web.science.portal.session.events.onSessionActionError, handleSessionActionError)
      portalCore.subscribe(portalSessions, cadc.web.science.portal.session.events.onLoadPlatformUsageDone, populatePlatformUsage)
      portalCore.subscribe(portalSessions, cadc.web.science.portal.session.events.onLoadPlatformUsageError, handleSessionActionError)

      // Listeners for this class (science_portal.js)
      portalCore.subscribe(_selfPortalApp, cadc.web.science.portal.events.onSessionRequestOK, refreshSessionForm)

      // Portal Form listeners
      portalCore.subscribe(portalForm, cadc.web.science.portal.form.events.onLoadFormDataDone, initForm)
      portalCore.subscribe(portalForm, cadc.web.science.portal.form.events.onLoadTypeMapDone, continueInit)
      portalCore.subscribe(portalForm, cadc.web.science.portal.form.events.onLoadContextDataError, handleServiceError)
      portalCore.subscribe(portalForm, cadc.web.science.portal.form.events.onLoadImageDataError, handleServiceError)
    } // end attachListeners()

    function handleServiceError(e, request) {
      // Stop any outstanding ajax calls from being processed. If one has failed,
      // it's assumed the skaha service is unreachable or has something else wrong,
      // so the page becomes unavailable
      portalForm.interruptAjaxProcessing()

      // This should be triggered if the user doesn't have access to Skaha resources, as well as
      // other error conditions. Without access to Skaha, the user should be blocked from using the page,
      // but be directed to some place they can ask for what they need (a resource allocation.)
      const authErrorHandling = cadc.web.science.portal.authErrorHandling
      if (authErrorHandling.codes.includes(request.status)) {
          portalCore.setModal(_reactApp, authErrorHandling.header, authErrorHandling.body, false, false, true)
      } else {
          portalCore.setModal(_reactApp, "Service Error", portalCore.getRcDisplayText(request), false, true, true)
      }
    }

    function handlePlatformUsageLoad() {
      // Leave the list as is, and update the progress bar to show something is happening.
      // portalCore.setModal(_reactApp,"Statistics Check", "Fetching platform usage", true, false, false)
      portalCore.clearAjaxAlert(portalCore.pageSections.usage)
      portalCore.setPageState(portalCore.pageSections.usage, "primary", true, "")
      portalSessions.loadPlatformUsage(_selfPortalApp.handlePlatformUsage)
    }

    function handleSessionActionError(_e, request) {
      portalCore.setAjaxFail(portalCore.pageSections.sessionList, request)
    }

    function refreshSessionForm() {
      _curSessionType = portalForm.getSessionTypeDefault()
      setLaunchForm(_curSessionType)
      checkForSessions()
    }

    // ------------ Data display functions

    function populatePlatformUsage() {
      // reset page state
      portalCore.setPageState(portalCore.pageSections.usage, "success", false)
      portalCore.hideModal()
      var platformUsage = portalSessions.getPlatformUsage()

      // pass platformUsage info to the react App for rendering
      _reactApp.updatePlatformUsage(platformUsage)
    }

    function populateSessionList(sessionData) {
      if (JSON.stringify(sessionData) === "[]") {
        // Pass list to the react app portion for rendering
        const sessDataObj = {
          "listType" : "empty",
          "sessData" : []
        }
        _reactApp.updateSessionList(sessDataObj)
      } else {

        // Build new list
        // Assuming a list of sessions is provided, with connect url, name, type
        const newSessionList = []
        $(sessionData).each(function () {

          var mapEntry = portalForm.getMapEntry(this.type)
          // Check to see if there are any items in the sessionType_map that
          // may override the defaults
          var iconSrc = _selfPortalApp.baseURL + "/science-portal/images/"
          if (mapEntry != null) {
            if (typeof mapEntry.portal_icon != "undefined") {
              iconSrc += mapEntry.portal_icon
            } else {
              iconSrc += "fas_cube.png"
            }

            // Default is the type. May be overridden in the sessiontype_map_en.json file
            var iconLabel = this.type
            if (typeof mapEntry.portal_text != "undefined") {
              iconLabel = mapEntry.portal_text
            }
          }

          const nextSessionItem = {
            "id" : this.id,
            "name" : this.name,
            "status": this.status,
            "logo": iconSrc,
            "image": portalCore.dataFilters.imageName(this.image),
            "requestedRAM": this.requestedRAM,
            "ramInUse": this.ramInUse,
            "requestedCPUCores": this.requestedCPUCores,
            "coresInUse": this.cpuCoresInUse,
            "requestedGPUCores" : this.requestedGPUCores,
            "gpuUtilization" : this.gpuUtilization,
            "gpuRAMInUse" : this.gpuRAMInUse,
            "altText": iconLabel,
            "connectURL": this.connectURL,
            "startTime": portalCore.dataFilters.startTime(this.startTime),
            "expiryTime": portalCore.dataFilters.startTime(this.expiryTime),
            "type" : this.type,
            "deleteHandler": handleDeleteSession,
            "connectHandler": handleConnectRequest,
            "renewHandler": handleRenewSession,
            "viewLogsURL": portalSessions.getViewLogsURL(this.id ),
            "viewEventsURL" : portalSessions.getViewEventsURL(this.id),
            "isFixedResources": this.isFixedResources
          }

          // Add to the list
          newSessionList.push(nextSessionItem)
        })

        // Pass list to the react app portion for rendering
        const sessDataObj = {
          "listType" : "list",
          "sessData" : newSessionList
        }
        _reactApp.updateSessionList(sessDataObj)
      }
    }


    function checkForSessions() {
      portalCore.setModal(_reactApp,"Session Check", "Fetching session list", true, false, false)
      portalCore.clearAjaxAlert(portalCore.pageSections.sessionList)
      portalCore.setPageState(portalCore.pageSections.sessionList, "primary", true)
      portalSessions.loadSessionList()
    }


    // ------------ Event Handlers ------------

    /**
     * Instead of going directly to the session, check to make sure it's in 'Running' state first.
     * @param curSession
     */
    function handleConnectRequest(event, data) {
      event.preventDefault()
      // Pull data-* information from anchor element
      var sessionData = $(event.currentTarget).data()
      portalCore.setPageState(portalCore.pageSections.all,"success", false)
      window.open(sessionData.connecturl, "_blank")
    }

    /**
     * Triggered from "Reload" button on info modal
     */
    function handlePageRefresh() {
      window.location.reload()
    }

    /**
     * Triggered from delete element on individual session
     */
    function handleDeleteSession(event) {
      event.preventDefault()
      portalCore.clearAjaxAlert(portalCore.pageSections.sessionList)
      var sessionData = event.currentTarget.dataset
      _state.currentSessionData = sessionData
      portalCore.setConfirmModal(_reactApp, handleConfirmedDelete, sessionData)
    }

    /**
     * Triggered from the delete modal
     */
    function handleConfirmedDelete(_event) {
      var sessionData = _state.currentSessionData
      portalCore.hideConfirmModal(_reactApp)
      portalCore.setModal(_reactApp, "Delete Request", "Deleting session", true, false, false)
      portalSessions.deleteSession(sessionData.id)
    }

    /**
     * Triggered from the delete modal
     */
    function handleCancelDelete(_event) {
      portalCore.hideConfirmModal(_reactApp)
    }

    /**
     * Triggered from the renew icon on a session card
     */
    function handleRenewSession(event) {
      portalCore.clearAjaxAlert(portalCore.pageSections.sessionList)
      var sessionData = event.currentTarget.dataset
      portalCore.setModal(_reactApp, "Renew Session Request", "Extending session time", true, false, false)
      portalSessions.renewSession(sessionData.id)
    }

    // ------------ HTTP/Ajax functions & event handlers ------------

    /**
     * Submit button function
     * @param event
     */
    function handleSessionRequest(event) {
      // Stop normal form submit
      event.preventDefault()
      portalCore.clearAjaxAlert(portalCore.pageSections.form)

      const _prunedFormData = new FormData()
      const form = event.target

      for (const currentValue of form) {
        // Skip fields without a name to avoid empty keys
        if (!currentValue.name) continue;

        // For radio/checkbox buttons, only submit if checked
        if ((currentValue.type === 'radio' || currentValue.type === 'checkbox') && !currentValue.checked) continue;

        _prunedFormData.append(currentValue.name, currentValue.value)
      }

      // This is sent from the Private (Advanced) form
      const repositoryHostFieldName = "repositoryHost"
      if (_prunedFormData.has(repositoryHostFieldName)) {
        const repositoryHost = _prunedFormData.get(repositoryHostFieldName)
        const image = `${repositoryHost}/${_prunedFormData.get("image")}`

        _prunedFormData.delete(repositoryHostFieldName)
        _prunedFormData.set("image", image)
      }

      portalCore.setPageState(portalCore.pageSections.form, "primary", true, '')
      portalCore.setModal(_reactApp, "Requesting Session", "Requesting new session", true, false, false)
      Promise.resolve(postSessionRequestAjax(portalCore.sessionServiceURLs.session, _prunedFormData))
        .then(function(sessionInfo) {
          portalCore.setPageState(portalCore.pageSections.form,"success", false)
          portalCore.hideModal(_reactApp)
          portalCore.trigger(_selfPortalApp, cadc.web.science.portal.events.onSessionRequestOK, sessionInfo)
        })
        .catch(function(request) {
          portalCore.handleAjaxError(portalCore.pageSections.form, request)
        })
    }

    function postSessionRequestAjax(serviceURL, sessionData) {
      const portalLogin = new cadc.web.science.portal.login.PortalLogin({reactApp: _reactApp});
      return new Promise(function (resolve, reject) {
        const request = new XMLHttpRequest();

        // "load" is the XMLHttpRequest "finished" event
        request.addEventListener(
          "load",
          function () {
            if (request.status === 200) {
              // Session ID and data from server not returned with
              // this request. Use the name & type posted in form
              // to identify this request going forward
              resolve({"name": sessionData.get("name"), "type": sessionData.get("type")})
            } else if (request.status === 400) {
              reject(request)
            } else if (request.status === 401) {
              portalCore.hideModal()
              const userState = {
                loginHandler : portalLogin.handleLoginRequest
              }
              _reactApp.setNotAuthenticated(userState)
            }
          },
          false
        )
        // withCredentials enables cookies to be sent
        // Note: SameSite cookie header isn't set with this method,
        // may cause problems with Chrome and other browsers? Feb 2021
        request.withCredentials = true

        request.open("POST", serviceURL)

        // Request headers can only be set after the request is open.
        const secretFieldName = "repositoryAuthSecret"
        const secretHeader = "x-repository-secret"
        const usernameHeader = "x-repository-username"
        if (sessionData.has(secretFieldName)) {
          const secret = sessionData.get(secretFieldName)
          const username = sessionData.get("repositoryAuthUsername")
          if (secret) {
            request.setRequestHeader(secretHeader, secret)
          }

          if (username) {
            request.setRequestHeader(usernameHeader, username)
          }

          sessionData.delete(secretFieldName)
        }

        request.send(sessionData)
      }) // end Promise

    }

    // ---------------- Launch form handling functions ----------------

    // This can only happen after the portalForm has grabbed all the data
    // triggered when onLoadFormDataDone is issued
    function initForm() {
      resetLaunchForm()
    }

    function buildFormDataForType(sType) {
      const defaultName = portalSessions.getDefaultSessionName(sType.trim())
      const formDataForType = portalForm.getFormDataForType(sType, defaultName)
      // Q: not sure what happens with the old handlers, are they GCd correctly?
      // Consider having handlers submitted as props, and only the variable
      // parts of the form - dropdown content, set as state values
      formDataForType.submitHandler = handleSessionRequest
      formDataForType.changeTypeHandler = setLaunchFormForType
      formDataForType.resetHandler = resetLaunchForm
      formDataForType.experimentalFeatures = inputs.experimentalFeatures
      formDataForType.defaultProjectName = inputs.defaultProjectName
      return formDataForType
    }

    function setLaunchForm(curType) {
      var fData = buildFormDataForType(curType)
      _reactApp.updateLaunchForm(fData)
    }

    function resetLaunchForm() {
      portalCore.clearAjaxAlert()
      _curSessionType = portalForm.getSessionTypeDefault()
      setLaunchForm(_curSessionType)
    }

    function setLaunchFormForType(e) {
      e.preventDefault()
      var sessionType = e.target.value
      setLaunchForm(sessionType)
      _curSessionType = sessionType
    }

    // TODO: this is for testing only
    function sortSessionList(theList) {
      return portalSessions.sortSessions(theList)
    }

    $.extend(this, {
      init: init,
      sortSessionList: sortSessionList,
      portalCore: portalCore
    })
  }

})(jQuery)
