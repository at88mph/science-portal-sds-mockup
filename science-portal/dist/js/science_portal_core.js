;(function($) {
  // register namespace
  $.extend(true, window, {
    cadc: {
      web: {
        science: {
          portal: {
            core: {
              PortalCore: PortalCore,
              // Events
              events: {
                onAuthenticated: new jQuery.Event("sciPort:onAuthenticated"),
                onServiceURLOK: new jQuery.Event("sciPort:onServiceURLOK"),
                onServiceURLFail: new jQuery.Event("sciPort:onServiceURLFail")
              },
              headerURI: {
                search: "ivo://cadc.nrc.ca/search",
                gmui: "ivo://cadc.nrc.ca/groups"
              },
              userInfoEndpoint: '/science-portal/userinfo',
              sessionEndpoint: '/science-portal/session',
              imageEndpoint: '/science-portal/image',
              contextEndpoint: '/science-portal/context',
              repositoryEndpoint: '/science-portal/repository',
            }
          }
        }
      }
    }
  })

  /**
   * Common functions to support Science Portal UI.
   *
   * @constructor
   * @param {{}} inputs   Input configuration.
   * @param {String} [inputs.baseURL="https://www.canfar.net/"] URL of the /reg web service
   * needed by the Registry to look up web service and ui URLs for use in ajax calls by this page.
   */
  function PortalCore(inputs) {

    var _selfPortalCore = this
    const baseURL =
            inputs && inputs.hasOwnProperty("baseURL")
                ? inputs.baseURL
                : "https://www.canfar.net"

    var portalLogin = new cadc.web.science.portal.login.PortalLogin(inputs)
    this.userInfo = {}

    var _rApp = inputs.reactApp
    this.pageState = _rApp.getPageState()
    this.pageSections = {
      "all" : "all",
      "sessionList" : "spSessionList",
      "form" : "spForm",
      "usage" : "spPlatformUsage"
    }

    function init(overrideURLs, accessToken) {
      setSessionServiceURLs(overrideURLs, accessToken)
    }

    // Primarily used for testing
    function setReactAppRef(reactApp) {
      _selfPortalCore._rApp = reactApp
    }

    // ------------ Page state management functions ------------

    function setModal(_modalLink, title, msg, showSpinner, showReload, showHome) {
      var modaldata = {
        "msg": msg,
        "title": title,
        "isOpen": true,
        "showSpinner": showSpinner,
        "showReload": showReload,
        "showHome" : showHome
      }
      _rApp.updateModal(modaldata)
    }

    function hideModal() {
      var modaldata = {
        "msg": "",
        "title": "",
        "isOpen": false,
        "showSpinner": false,
        "showReload": false,
        "showHome" : false
      }
      _rApp.updateModal(modaldata)
    }

    function setConfirmModal(_modalLink, confirmFn, confirmData) {
      var deleteMsg = "Session name " + confirmData.name + ", id " + confirmData.id

      var modaldata = {
        handlers: {
          "onConfirm": confirmFn,
          "onClose": hideConfirmModal
        },
        dynamicProps: {
          "msg": deleteMsg,
          "isOpen": true,
          "confirmData": confirmData
        }
      }
      _rApp.openConfirmModal(modaldata)
    }

    function initConfirmModal(modalLink, confirmFn, cancelFn) {
      var modaldata = {
        handlers: {
          "onConfirm": confirmFn,
          "onClose": hideConfirmModal
        },
        dynamicProps: {
          "msg": "",
          "isOpen": false,
          "confirmData": {}
        }
      }
      _rApp.setConfirmModal(modaldata)
    }

    function hideConfirmModal(modalLink) {
      var
        modalData =  {
        dynamicProps:  {
            "msg": "",
            "buttonText": "Delete",
            "confirmData": {}
          }
        }
      _rApp.closeConfirmModal(modalData)
    }

    function showLoginModal() {
      _rApp.openLoginModal(true)
    }

    function hideLoginModal() {
      _rApp.openLoginModal(false)
    }

    function clearAjaxAlert() {
      setPageState(_selfPortalCore.pageSections.all,"success", false)
    }


    function _mkAlertData(barType, msg, show) {
      var alert = {}
      if ((typeof msg !== "undefined") && (msg !== "") ) {
        alert = {
          "type": barType,
          "show":  true,
          "message": msg
        }
      } else {
        alert = {
          "show": false
        }
      }
      return alert
    }

    function _mkProgressBarData(barType, isAnimated) {
      var progressBar = {
        "type": barType,
        "animated": isAnimated
      }

      return progressBar
    }

    // Communicate AJAX progress and status using progress bars
    // and alert boxes
    function setPageState(pageSection, barType, isAnimated, msg) {

      var pageState = _selfPortalCore.pageState

        if (pageSection === "all") {
          // Used to reset entire page, or to
          // set all progress bars to red if there's a skaha service error
          pageState.spForm.alert.show = false
          pageState.spForm.progressBar = _mkProgressBarData(barType, isAnimated)
          pageState.spPlatformUsage.alert.show = false
          pageState.spPlatformUsage.progressBar = _mkProgressBarData(barType, isAnimated)
          pageState.spSessionList.alert.show = false
          pageState.spSessionList.progressBar = _mkProgressBarData(barType, isAnimated)
        } else {
          pageState[pageSection].progressBar = _mkProgressBarData(barType, isAnimated)
          if (barType == "danger") {
            pageState[pageSection].alert = _mkAlertData(barType, msg, true)
          } else {
            pageState[pageSection].alert.show = false
          }
        }

      _rApp.setPageStatus(pageState)
    }

    function setAjaxFail(pageSection, message) {
      if (message.status === 401) {
        hideModal()
        var userState = {
          loginHandler : portalLogin.handleLoginRequest
        }
        _rApp.setNotAuthenticated(userState)
      } else {
        const errorMessage = getRcDisplayText(message)
        console.error(`${message.status}: ${errorMessage}`)
        setPageState(pageSection, "danger", false, errorMessage)
        hideModal()
      }
    }

    function setAjaxSuccess(pageSection, message) {
      setPageState(pageSection,"success", false, message)
    }

    function handleAjaxError(pageSection, request) {
      hideModal()
      setAjaxFail(pageSection, request)
    }

    // ----------- Data Filtering and Display Functions -----------------

    function getDisplayStartTime(startTime) {
      // v 3.0: Times come from skaha in UTC, with 'T' and 'Z'
      var tmpTime = ""
      if (startTime !== undefined) {
        tmpTime = startTime.replace("T", " ")
        // Truncate seconds and "Z" from time stamp
        tmpTime = tmpTime.substr(0, tmpTime.lastIndexOf(":"))

      } else {
        tmpTime = "not available"
      }
      return tmpTime
    }

    function getDisplayImageName(imageName) {
      // v 3.0: each image has the host name of the
      // harbor instance as it's first element. For now,
      // this is pruned off as it's the same for all images
      // served by the portal
      var firstSlashIdx = imageName.indexOf("/")
      var prunedImage = imageName.substr(firstSlashIdx + 1, imageName.length)
      return prunedImage
    }

    // Structure is used to pass into science_portal_form to produce the image list for display,
    // also used in science_portal to set data to be passed into SessionItem react component.
    // values are the functions immediately above this declaration
    this.dataFilters = {
      "startTime" : getDisplayStartTime,
      "imageName" : getDisplayImageName
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


    // ------------ HTTP/Ajax functions ------------

    // ------ Set up web service URLs ------

    function setSessionServiceURLs(URLs) {
      if (typeof URLs !== "undefined") {
        _selfPortalCore.sessionServiceURLs = URLs
        trigger(_selfPortalCore, cadc.web.science.portal.core.events.onServiceURLOK)
      } else {
        setModal(_rApp, "Loading Page Resources", "Locating session web service.", true, false, false)
        _selfPortalCore.sessionServiceURLs = {
          "base": baseURL,
          "session": `${baseURL}${cadc.web.science.portal.core.sessionEndpoint}`,
          "context": `${baseURL}${cadc.web.science.portal.core.contextEndpoint}`,
          "repositoryHosts": `${baseURL}${cadc.web.science.portal.core.repositoryEndpoint}`,
          "images": `${baseURL}${cadc.web.science.portal.core.imageEndpoint}`
        }

        _selfPortalCore.hideModal()
        trigger(_selfPortalCore, cadc.web.science.portal.core.events.onServiceURLOK)
      }
    }

// ------------ Service Status parsing & display functions ------------

    /**
     * Parse return codes and add text for the screen
     * @param request
     * @returns {string}
     */
    function getRcDisplayText(request) {
      var displayText
      switch(request.status) {
        case 403:
          displayText = "You are not authorised to use Skaha resources. Contact CANFAR admin" +
          " for information on how to get set up with a resource allocation and permission to access the service."
          break
        case 501:
          displayText = 'The Skaha web service is not configured in the Registry.'
          break;
        default:
          displayText = request.responseText ? request.responseText.trim() : "Unknown error"
          break
      }

      return displayText
    }

    /**
     * Parse return codes and add text for the screen
     * @param request
     * @returns {string}
     */
    function getRcDisplayTextPlusCode(request) {
      var displayText
      switch(request.status) {
        case 403:
          displayText = "Your username is not authorized to use Skaha resources. Contact CANFAR admin" +
            " for information on how to get set up with a resource allocation and permissions."
          break
        default:
          displayText = request.responseText
          break
      }

      return "(" + request.status + ")" + displayText
    }


    // ------------ Authentication functions ------------

    function checkAuthentication() {
      fetch(baseURL + cadc.web.science.portal.core.userInfoEndpoint)
      .then((response) => {
        if (!response.ok) {
          if (response.status === 401) {
            const userState = {
              loginHandler : portalLogin.handleLoginRequest
            }
            _rApp.setNotAuthenticated(userState)
          } else {
            const alertMsg = getRcDisplayText(response)
            setPageState(_selfPortalCore.pageSections.sessionList, "danger", false, alertMsg)
          }
          hideModal()
          return Promise.reject(response)
        } else {
          return response.json()
        }
      }).then((responseJSON) => {
        this.userInfo = responseJSON
        setAuthenticated()
      }).catch((error) => {
        console.warn(error)
      })
    }

    function setAuthenticated() {
      const userState = {}
      if (Object.keys(_selfPortalCore.userInfo).length === 0) {
        userState.username = "Unknown"
        userState.name = "Unknown"
      } else {
        const userInfo = _selfPortalCore.userInfo
        if (userInfo.hasOwnProperty('preferred_username')) {
          userState.username = userInfo.preferred_username
        } else if (userInfo.hasOwnProperty('name')) {
          userState.username = userInfo.name
        } else {
          userState.username = "Unknown"
        }

        // Prefer name property when displaying actual name.
        if (userInfo.hasOwnProperty('name')) {
          userState.name = userInfo.name
        } else if (userInfo.hasOwnProperty('preferred_username')) {
          userState.name = userInfo.preferred_username
        } else {
          userState.name = "Unknown"
        }
      }

      _rApp.setAuthenticated(userState)
      trigger(_selfPortalCore, cadc.web.science.portal.core.events.onAuthenticated, {"userState": userState})
    }

    $.extend(this, {
      init: init,
      setSessionServiceURLs: setSessionServiceURLs,
      setAjaxSuccess: setAjaxSuccess,
      setAjaxFail: setAjaxFail,
      setPageState: setPageState,
      setReactAppRef: setReactAppRef,
      clearAjaxAlert: clearAjaxAlert,
      handleAjaxError: handleAjaxError,
      setConfirmModal: setConfirmModal,
      hideConfirmModal: hideConfirmModal,
      checkAuthentication: checkAuthentication,
      subscribe: subscribe,
      unsubscribe: unsubscribe,
      trigger: trigger,
      getRcDisplayText: getRcDisplayText,
      getRcDisplayTextPlusCode: getRcDisplayTextPlusCode,
      setModal: setModal,
      hideModal: hideModal,
      showLoginModal: showLoginModal,
      hideLoginModal: hideLoginModal,
      initConfirmModal: initConfirmModal
    })
  }

})(jQuery)
