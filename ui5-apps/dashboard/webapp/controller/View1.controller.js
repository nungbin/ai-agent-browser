sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Fragment",
    "sap/m/MessageToast",
    "sap/ui/core/BusyIndicator"  // 1. Added the BusyIndicator module
], function (Controller, JSONModel, Fragment, MessageToast, BusyIndicator) {
    "use strict";

    return Controller.extend("com.agentbrowser.dashboard.controller.View1", {
        
        _sApiUrl: "https://script.google.com/macros/s/AKfycbyYXjrZxHhEN8zYvcZuqgylMqrSAZ9exq9QS9gwAFTd53mx6c3Z7ud_VeZTBCEbheju-A/exec",

        onInit: function () {
            var oViewModel = new JSONModel({ 
                isEditable: false,
                currentYear: "2022" 
            });
            this.getView().setModel(oViewModel, "viewModel");

            var oDataModel = new JSONModel();

            // 2. Automate the Loading Spinner for any data fetch!
            oDataModel.attachRequestSent(function () {
                BusyIndicator.show(0); // 0 means show immediately without delay
            });
            oDataModel.attachRequestCompleted(function () {
                BusyIndicator.hide();
            });
            oDataModel.attachRequestFailed(function () {
                BusyIndicator.hide();
                MessageToast.show("Failed to sync with Google Sheets!");
            });

            this.getView().setModel(oDataModel, "dataModel");

            // Initial load from Google
            oDataModel.loadData(this._sApiUrl);
            this._loadFormFragment("2022");
        },

        onMenuPress: function () {
            this.byId("testingSplitApp").showMaster();
        },

        onToggleEdit: function () {
            var oViewModel = this.getView().getModel("viewModel");
            oViewModel.setProperty("/isEditable", !oViewModel.getProperty("/isEditable"));
        },

        onYearSelect: function (oEvent) {
            var sYear = oEvent.getParameter("listItem").getTitle();
            this.byId("testingSplitApp").hideMaster();
            
            // 3. Force a fresh data pull from the live Google Sheet!
            this.getView().getModel("dataModel").loadData(this._sApiUrl);

            this._loadFormFragment(sYear);
        },

        onSaveData: function () {
            var oView = this.getView();
            var oDataModel = oView.getModel("dataModel");
            var oViewModel = oView.getModel("viewModel");

            var sCurrentYear = oViewModel.getProperty("/currentYear");
            var oCurrentData = oDataModel.getProperty("/" + sCurrentYear);

            // Use our newly imported BusyIndicator here too
            BusyIndicator.show(0);

            var payload = {
                year: sCurrentYear,
                payload: oCurrentData
            };

            fetch(this._sApiUrl, {
                method: "POST",
                body: JSON.stringify(payload),
                headers: {
                    "Content-Type": "text/plain;charset=utf-8"
                }
            })
            .then(function(response) {
                BusyIndicator.hide();
                MessageToast.show("Successfully saved to Google Sheets!");
                oViewModel.setProperty("/isEditable", false);
            })
            .catch(function(error) {
                BusyIndicator.hide();
                MessageToast.show("Network Error while saving!");
                console.error(error);
            });
        },

        _loadFormFragment: function (sYear) {
            var oContainer = this.byId("dynamicFormContainer");
            var oView = this.getView();
            var oViewModel = this.getView().getModel("viewModel");

            oViewModel.setProperty("/currentYear", sYear);
            oContainer.destroyItems();

            Fragment.load({
                id: oView.getId(),
                name: "com.agentbrowser.dashboard.fragment.Form" + sYear,
                controller: this
            }).then(function (oFragment) {
                oView.addDependent(oFragment);
                oContainer.addItem(oFragment);
                
                this.byId("detailPage").bindElement({
                    path: "dataModel>/" + sYear
                });

            }.bind(this)).catch(function() {
                MessageToast.show("No form design found for year " + sYear);
            });
        }

    });
});