sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Fragment",
    "sap/m/MessageToast"
], function (Controller, JSONModel, Fragment, MessageToast) {
    "use strict";

    return Controller.extend("com.agentbrowser.dashboard.controller.View1", {
        
        onInit: function () {
            // Added 'currentYear' to track what year the header should display
            var oViewModel = new JSONModel({ 
                isEditable: false,
                currentYear: "2022" 
            });
            this.getView().setModel(oViewModel, "viewModel");

            var oDataModel = new JSONModel();
            oDataModel.loadData(sap.ui.require.toUrl("com/agentbrowser/dashboard/model/data.json"));
            this.getView().setModel(oDataModel, "dataModel");

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
            this._loadFormFragment(sYear);
        },

        _loadFormFragment: function (sYear) {
            var oContainer = this.byId("dynamicFormContainer");
            var oView = this.getView();
            var oViewModel = this.getView().getModel("viewModel");

            // 1. Update the Year in the View Model so the Header Title changes
            oViewModel.setProperty("/currentYear", sYear);

            oContainer.destroyItems();

            Fragment.load({
                id: oView.getId(),
                name: "com.agentbrowser.dashboard.fragment.Form" + sYear,
                controller: this
            }).then(function (oFragment) {
                oView.addDependent(oFragment);
                oContainer.addItem(oFragment);
                
                // 2. Bind the data to the ENTIRE Detail Page! 
                // Now both the Header and the Fragment can access the JSON data.
                this.byId("detailPage").bindElement({
                    path: "dataModel>/" + sYear
                });

            }.bind(this)).catch(function() {
                MessageToast.show("No form design found for year " + sYear);
            });
        }

    });
});